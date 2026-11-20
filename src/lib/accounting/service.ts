// SERVER-ONLY. The booking agent end to end, for the routes and the daily
// job: read a receipt's proposal (building it when needed), approve it, post
// it, and reconcile what was left uncertain. The routes have already
// checked the caller may see the receipt; this file decides whether they
// may approve (permissions.ts) and never trusts an organisation id from the
// request.

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReceiptPdf } from "@/components/receipt/ReceiptPdf";
import { rateLimit } from "@/lib/rate-limit";
import { originalFileOf } from "@/lib/receipts/original-file";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AccountingConnection, BookingProposalRow, Receipt } from "@/lib/types";
import { fortnoxCaller, FortnoxAuthError, type FortnoxCaller } from "./fortnox/api";
import { loadBookingContext } from "./fortnox/context";
import { fortnoxConfigured } from "./fortnox/oauth";
import { connectFile, findVoucherByMarker, postVoucher, type ReceiptFile } from "./fortnox/post";
import { rememberChoice, recentChoices, rememberedAccount } from "./memory";
import { activeFirmOf, mayApprove, organizationActor } from "./permissions";
import { proposeBooking, type ProposalResult } from "./propose";
import { chooseAccountWithModel } from "./propose-model";
import {
  IN_FORTNOX,
  approveProposal,
  claimForPosting,
  getProposal,
  saveProposal,
  storedVoucher,
  updateProposal,
} from "./proposals";
import { getConnection, getSettings, supabaseTokenStore } from "./store";
import { getAccessToken, ReconnectRequiredError, TokenUnavailableError } from "./tokens";
import type { BookingBlock, BookingContext, BookingNote, BookingSettings, FortnoxAccount } from "./types";

/** Older than this, an "approved" or "posting" row was abandoned mid-way. */
export const STALE_MS = 5 * 60 * 1000;
/** A lost answer with no voucher found this long after is "not created". */
export const NOT_CREATED_AFTER_MS = 10 * 60 * 1000;

export type ProposalView = {
  id: string;
  status: BookingProposalRow["status"];
  updatedAt: string;
  transactionDate: string;
  description: string;
  series: string;
  rows: Array<{ account: string; name: string; debit: number; credit: number }>;
  totalSek: number;
  source: BookingProposalRow["source"];
  confidence: number | null;
  notes: BookingNote[];
  reason: string | null;
  debitAccount: string | null;
  edited: boolean;
  errorCode: string | null;
  voucherRef: string | null;
  fileConnected: boolean;
  postedAt: string | null;
};

export type BookingView =
  | { kind: "not_configured" }
  | { kind: "not_connected"; canConnect: boolean }
  | { kind: "needs_reconnect"; canConnect: boolean }
  | { kind: "unavailable" }
  | { kind: "waiting" }
  | { kind: "blocked"; blocks: BookingBlock[]; canApprove: boolean }
  | {
      kind: "proposal";
      proposal: ProposalView;
      canApprove: boolean;
      /** Active cost accounts, for "Change account" (only for someone who may approve). */
      accounts: Array<{ number: string; name: string }>;
    };

export class BookingError extends Error {
  constructor(
    readonly code:
      | "forbidden"
      | "not_connected"
      | "needs_reconnect"
      | "unavailable"
      | "changed"
      | "blocked"
      | "rate_limited"
      | "no_company",
    readonly blocks: BookingBlock[] = [],
  ) {
    super(`booking: ${code}`);
    this.name = "BookingError";
  }
}

// ---------------------------------------------------------------------------
// Fortnox access

async function callerFor(conn: AccountingConnection, forceRefresh = false): Promise<FortnoxCaller> {
  const token = await getAccessToken(conn.id, { store: supabaseTokenStore(), forceRefresh });
  return fortnoxCaller(token, conn.id);
}

/** Runs read-only work against Fortnox; one retry with a new token after a 401. */
async function readFortnox<T>(conn: AccountingConnection, fn: (call: FortnoxCaller) => Promise<T>): Promise<T> {
  try {
    return await fn(await callerFor(conn));
  } catch (err) {
    if (err instanceof FortnoxAuthError) return fn(await callerFor(conn, true));
    throw err;
  }
}

function asBookingError(err: unknown): BookingError {
  if (err instanceof BookingError) return err;
  if (err instanceof ReconnectRequiredError) return new BookingError("needs_reconnect");
  if (err instanceof TokenUnavailableError && err.reason === "gone") return new BookingError("not_connected");
  return new BookingError("unavailable");
}

// ---------------------------------------------------------------------------
// Reading what the agent needs

async function companyCurrency(organizationId: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("currency")
    .eq("id", organizationId)
    .maybeSingle();
  // Strict: a guessed currency would book kronor that aren't kronor.
  if (error || !data?.currency) throw new BookingError("unavailable");
  return String(data.currency);
}

function bookingSettings(row: Awaited<ReturnType<typeof getSettings>>): BookingSettings | null {
  if (!row) return null;
  return {
    voucherSeries: row.voucher_series,
    creditAccountCompany: row.credit_account_company,
    creditAccountEmployee: row.credit_account_employee,
  };
}

function costAccounts(accounts: ReadonlyMap<string, FortnoxAccount>): Array<{ number: string; name: string }> {
  return [...accounts.values()]
    .filter((a) => a.active && /^[4-7][0-9]{3}$/.test(a.number))
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((a) => ({ number: a.number, name: a.description }));
}

export function proposalView(row: BookingProposalRow, accounts?: ReadonlyMap<string, FortnoxAccount>): ProposalView {
  const v = storedVoucher(row);
  return {
    id: row.id,
    status: row.status,
    updatedAt: row.updated_at,
    transactionDate: v.transactionDate,
    description: v.description,
    series: v.series,
    rows: v.rows.map((r) => ({ ...r, name: accounts?.get(r.account)?.description ?? "" })),
    totalSek: v.totalSek,
    source: row.source,
    confidence: row.confidence == null ? null : Number(row.confidence),
    notes: (row.notes ?? []) as BookingNote[],
    reason: v.reason ?? null,
    debitAccount: v.rows.find((r) => r.debit > 0)?.account ?? null,
    edited: row.edited,
    errorCode: row.error_code,
    voucherRef:
      row.fortnox_voucher_series && row.fortnox_voucher_number != null
        ? `${row.fortnox_voucher_series} ${row.fortnox_voucher_number}`
        : null,
    fileConnected: row.file_connected,
    postedAt: row.posted_at,
  };
}

/** The agent's decision for a receipt, asking the model when the rules can't. */
async function decide(
  receipt: Receipt,
  organizationId: string,
  context: BookingContext,
  personAccount: string | null,
): Promise<ProposalResult> {
  const [currency, settingsRow, memoryAccount] = await Promise.all([
    companyCurrency(organizationId),
    getSettings(organizationId),
    rememberedAccount(organizationId, receipt.merchant_name),
  ]);
  const base = {
    receipt,
    companyCurrency: currency,
    context,
    settings: bookingSettings(settingsRow),
    memoryAccount,
    personAccount,
  };
  const first = proposeBooking(base);
  if (first.kind !== "needs_model") return first;

  const limited = await rateLimit("bookingModel", organizationId);
  if (!limited.ok) return { kind: "blocked", blocks: ["no_account"] };
  const modelChoice = await chooseAccountWithModel(receipt, context.accounts, await recentChoices(organizationId));
  if (!modelChoice) return { kind: "blocked", blocks: ["no_account"] };
  return proposeBooking({ ...base, modelChoice });
}

// ---------------------------------------------------------------------------
// The receipt sheet: what to show

/**
 * The booking state of a receipt for `userId`, who may already see it.
 * Builds (and saves) a proposal only for someone who may approve, so a
 * viewer never spends a Fortnox read or a Claude call.
 */
export async function loadBookingView(receipt: Receipt, userId: string): Promise<BookingView> {
  const organizationId = receipt.organization_id;
  if (!organizationId) return { kind: "unavailable" };

  const [actor, firmId, existing] = await Promise.all([
    organizationActor(userId, organizationId),
    activeFirmOf(organizationId),
    getProposal(receipt.id),
  ]);
  const canApprove = mayApprove(actor, firmId);
  const canConnect = actor !== null;

  // Already in Fortnox (or on its way): the state as stored. A post left
  // mid-way is settled first (never posted twice: reconcileProposal looks
  // the voucher up before anything else).
  if (existing && (existing.status === "approved" || (IN_FORTNOX as readonly string[]).includes(existing.status))) {
    let row = existing;
    const stale = Date.now() - Date.parse(existing.updated_at) >= STALE_MS;
    if (stale && existing.status !== "posted") {
      try {
        await reconcileProposal(existing);
        row = (await getProposal(receipt.id)) ?? existing;
      } catch (err) {
        Sentry.captureException(err, { tags: { area: "accounting", step: "view_reconcile" } });
      }
    }
    return { kind: "proposal", proposal: proposalView(row), canApprove: false, accounts: [] };
  }
  if (!fortnoxConfigured()) return { kind: "not_configured" };

  const conn = await getConnection(organizationId);
  if (!conn) return { kind: "not_connected", canConnect };
  if (conn.status !== "active") return { kind: "needs_reconnect", canConnect };
  if (!canApprove) {
    return existing
      ? { kind: "proposal", proposal: proposalView(existing), canApprove: false, accounts: [] }
      : { kind: "waiting" };
  }

  let context: BookingContext;
  try {
    context = await readFortnox(conn, (call) => loadBookingContext(conn.id, call));
  } catch (err) {
    const e = asBookingError(err);
    if (e.code === "needs_reconnect") return { kind: "needs_reconnect", canConnect };
    if (e.code === "not_connected") return { kind: "not_connected", canConnect };
    return { kind: "unavailable" };
  }

  // A proposal saved after the receipt last changed is still the agent's
  // answer (and a failed post keeps its reason on screen): reuse it.
  // Approval re-checks everything anyway.
  const fresh =
    (existing?.status === "proposed" || existing?.status === "failed") &&
    Date.parse(existing.updated_at) >= Date.parse(receipt.updated_at);
  if (fresh && existing) {
    return { kind: "proposal", proposal: proposalView(existing, context.accounts), canApprove, accounts: costAccounts(context.accounts) };
  }

  const result = await decide(receipt, organizationId, context, null);
  if (result.kind === "blocked") return { kind: "blocked", blocks: result.blocks, canApprove };
  if (result.kind === "needs_model") return { kind: "blocked", blocks: ["no_account"], canApprove };
  const row = await saveProposal({ receiptId: receipt.id, organizationId, proposal: result.proposal });
  return {
    kind: "proposal",
    proposal: proposalView(row, context.accounts),
    canApprove: canApprove && (row.status === "proposed" || row.status === "failed"),
    accounts: costAccounts(context.accounts),
  };
}

// ---------------------------------------------------------------------------
// Approve and post

async function receiptFile(receipt: Receipt): Promise<ReceiptFile> {
  const original = originalFileOf(receipt);
  const usable = original && ["image/jpeg", "image/png", "application/pdf"].includes(original.kind);
  if (original && usable) {
    const { data, error } = await getSupabaseAdmin().storage.from(original.bucket).download(original.path);
    if (!error && data) {
      const ext = original.kind === "application/pdf" ? "pdf" : original.kind === "image/png" ? "png" : "jpg";
      return { bytes: new Uint8Array(await data.arrayBuffer()), name: `kvitto-${receipt.id.slice(0, 8)}.${ext}`, contentType: original.kind };
    }
  }
  // An email, a webp photo, a typed receipt or an unreadable file: the
  // digital receipt as a PDF (what the firm export carries too).
  const pdf = await renderToBuffer(createElement(ReceiptPdf, { receipt }) as never);
  return { bytes: new Uint8Array(pdf), name: `kvitto-${receipt.id.slice(0, 8)}.pdf`, contentType: "application/pdf" };
}

async function markReceiptBooked(receiptId: string, bookedBy: string | null, ref: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("receipts")
    .update({ booked_at: new Date().toISOString(), booked_by: bookedBy, booked_ref: ref.slice(0, 60) })
    .eq("id", receiptId)
    .is("booked_at", null);
  if (error) {
    console.error("[accounting] receipt booked mark failed", error.code);
    Sentry.captureMessage("booking: receipt booked mark failed", { tags: { area: "accounting", step: "mark_booked" } });
  }
}

async function recordPosted(
  row: BookingProposalRow,
  posted: { series: string; number: number; year: number; fileConnected: boolean },
): Promise<void> {
  await updateProposal(row.id, {
    status: "posted",
    error_code: posted.fileConnected ? null : "file_not_attached",
    fortnox_voucher_series: posted.series,
    fortnox_voucher_number: posted.number,
    fortnox_financial_year: posted.year,
    file_connected: posted.fileConnected,
    posted_at: new Date().toISOString(),
  });
  await markReceiptBooked(row.receipt_id, row.approved_by, `Fortnox ${posted.series} ${posted.number}`);
}

async function loadReceipt(receiptId: string): Promise<Receipt | null> {
  const { data, error } = await getSupabaseAdmin().from("receipts").select("*").eq("id", receiptId).maybeSingle();
  if (error) throw new BookingError("unavailable");
  return (data as Receipt | null) ?? null;
}

/**
 * Posts an approved proposal (claims it first: only one caller wins).
 * Returns the row as it ends.
 */
export async function postApproved(row: BookingProposalRow): Promise<BookingProposalRow | null> {
  const claimed = await claimForPosting(row.id);
  if (!claimed) return getProposal(row.receipt_id);

  const backToApproved = async (code: string) => {
    // Nothing reached Fortnox's voucher endpoint: safe to try again later.
    await updateProposal(claimed.id, { status: "approved", error_code: code }, { fromStatus: ["posting"] });
  };

  let receipt: Receipt | null;
  let conn: AccountingConnection | null;
  let call: FortnoxCaller;
  let file: ReceiptFile;
  try {
    receipt = await loadReceipt(claimed.receipt_id);
    conn = await getConnection(claimed.organization_id);
    if (!receipt || !conn || conn.status !== "active") {
      await updateProposal(claimed.id, { status: "failed", error_code: !receipt ? "receipt_gone" : "not_connected" }, { fromStatus: ["posting"] });
      return getProposal(claimed.receipt_id);
    }
    call = await callerFor(conn);
    file = await receiptFile(receipt);
  } catch (err) {
    await backToApproved(err instanceof ReconnectRequiredError ? "needs_reconnect" : "prepare_failed");
    Sentry.captureException(err, { tags: { area: "accounting", step: "prepare_post" } });
    return getProposal(claimed.receipt_id);
  }

  const outcome = await postVoucher(
    call,
    storedVoucher(claimed),
    file,
    { fileUploaded: (fileId) => updateProposal(claimed.id, { fortnox_file_id: fileId }).then(() => undefined) },
    claimed.fortnox_file_id,
  );

  if (outcome.status === "posted") {
    await recordPosted(claimed, outcome);
  } else {
    await updateProposal(claimed.id, { status: outcome.status, error_code: outcome.errorCode }, { fromStatus: ["posting"] });
    if (outcome.status === "unknown") {
      Sentry.captureMessage("booking: voucher outcome unknown", { tags: { area: "accounting", code: outcome.errorCode } });
    }
  }
  return getProposal(claimed.receipt_id);
}

/**
 * A person approves the proposal they saw (`expectedUpdatedAt`), with the
 * expense account they chose, and it is posted. The voucher is rebuilt
 * from the receipt and the company's Fortnox at this moment: what is posted
 * is what the rules allow now, never a stale proposal.
 */
export async function approveAndPost(input: {
  receipt: Receipt;
  userId: string;
  account: string;
  expectedUpdatedAt: string;
  post?: boolean;
}): Promise<BookingProposalRow> {
  const { receipt, userId } = input;
  const organizationId = receipt.organization_id;
  if (!organizationId) throw new BookingError("no_company");

  const [actor, firmId] = await Promise.all([organizationActor(userId, organizationId), activeFirmOf(organizationId)]);
  if (!mayApprove(actor, firmId)) throw new BookingError("forbidden");

  const existing = await getProposal(receipt.id);
  if (!existing || existing.updated_at !== input.expectedUpdatedAt || !["proposed", "failed"].includes(existing.status)) {
    throw new BookingError("changed");
  }
  const conn = await getConnection(organizationId);
  if (!conn) throw new BookingError("not_connected");
  if (conn.status !== "active") throw new BookingError("needs_reconnect");

  let context: BookingContext;
  try {
    context = await readFortnox(conn, (call) => loadBookingContext(conn.id, call));
  } catch (err) {
    throw asBookingError(err);
  }
  const result = await decide(receipt, organizationId, context, input.account);
  if (result.kind !== "proposal") {
    throw new BookingError("blocked", result.kind === "blocked" ? result.blocks : ["no_account"]);
  }

  const edited = input.account !== existing.proposed_account;
  const stored = storedVoucher(existing);
  const approved = await approveProposal({
    receiptId: receipt.id,
    expectedUpdatedAt: existing.updated_at,
    voucher: { ...result.proposal.voucher, reason: edited ? null : stored.reason ?? null },
    source: edited ? "person" : existing.source,
    confidence: edited ? 1 : Number(existing.confidence ?? result.proposal.confidence),
    notes: result.proposal.notes,
    edited,
    approvedBy: userId,
  });
  if (!approved) throw new BookingError("changed");

  await rememberChoice(organizationId, receipt.merchant_name, input.account).catch(() => undefined);

  if (input.post === false) return approved;
  return (await postApproved(approved)) ?? approved;
}

// ---------------------------------------------------------------------------
// The daily job

/**
 * Settles one row that needs attention: posts an abandoned approval, finds
 * out whether a lost answer created a voucher, attaches a file that wasn't.
 * Never creates a voucher for a row whose earlier attempt may have.
 */
export async function reconcileProposal(row: BookingProposalRow, now: number = Date.now()): Promise<string> {
  const age = now - Date.parse(row.updated_at);

  if (row.status === "approved") {
    if (age < STALE_MS) return "fresh";
    const after = await postApproved(row);
    return `approved_${after?.status ?? "gone"}`;
  }

  // A post that died mid-way: we can't know whether the voucher exists.
  if (row.status === "posting") {
    if (age < STALE_MS) return "fresh";
    await updateProposal(row.id, { status: "unknown", error_code: "posting_abandoned" }, { fromStatus: ["posting"] });
    row = { ...row, status: "unknown" };
  }

  const conn = await getConnection(row.organization_id);
  if (!conn || conn.status !== "active") return "not_connected";
  const voucher = storedVoucher(row);

  if (row.status === "unknown") {
    const found = await readFortnox(conn, (call) => findVoucherByMarker(call, voucher, row.marker));
    if (found) {
      const fileConnected = row.fortnox_file_id
        ? await readFortnox(conn, (call) => connectFile(call, { fileId: row.fortnox_file_id!, ...found }))
        : false;
      await recordPosted(row, { ...found, fileConnected });
      return "found";
    }
    if (age < NOT_CREATED_AFTER_MS) return "wait";
    await updateProposal(row.id, { status: "failed", error_code: "not_created" }, { fromStatus: ["unknown"] });
    return "not_created";
  }

  if (row.status === "posted" && !row.file_connected && row.fortnox_file_id && row.fortnox_voucher_number != null) {
    const ok = await readFortnox(conn, (call) =>
      connectFile(call, {
        fileId: row.fortnox_file_id!,
        series: row.fortnox_voucher_series ?? voucher.series,
        number: row.fortnox_voucher_number!,
        year: row.fortnox_financial_year ?? voucher.financialYearId,
      }),
    );
    if (ok) await updateProposal(row.id, { file_connected: true, error_code: null });
    return ok ? "file_attached" : "file_pending";
  }
  return "nothing";
}
