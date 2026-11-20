// SERVER-ONLY. booking_proposals, read and moved with compare-and-set so two
// people (or a person and the daily job) can't post one receipt twice.
//
//   proposed ─approve→ approved ─claim→ posting ─→ posted
//      ↑                                    ├────→ failed  (nothing created; may approve again)
//      └───────────── rebuild ──────────────┘ └──→ unknown (reconcile first)

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { BookingProposalRow } from "@/lib/types";
import type { Proposal } from "./propose";
import { bookingMarker } from "./propose";
import type { ProposedVoucher } from "./types";

export class ProposalStoreError extends Error {
  constructor(step: string, code?: string | null) {
    super(`booking proposals: ${step} (${code ?? "unknown"})`);
    this.name = "ProposalStoreError";
  }
}

/** booking_proposals.voucher: the voucher plus the agent's one-line reason. */
export type StoredVoucher = ProposedVoucher & { reason: string | null };

const db = (client?: SupabaseClient) => client ?? getSupabaseAdmin();

/** Statuses a new proposal may replace. */
export const REBUILDABLE = ["proposed", "failed"] as const;
/** Statuses that mean the voucher is (or may be) in Fortnox. */
export const IN_FORTNOX = ["posting", "posted", "unknown"] as const;

export function storedVoucher(row: Pick<BookingProposalRow, "voucher">): StoredVoucher {
  return row.voucher as StoredVoucher;
}

export async function getProposal(receiptId: string, client?: SupabaseClient): Promise<BookingProposalRow | null> {
  const { data, error } = await db(client).from("booking_proposals").select("*").eq("receipt_id", receiptId).maybeSingle();
  if (error) throw new ProposalStoreError("read", error.code);
  return (data as BookingProposalRow | null) ?? null;
}

export async function getProposals(receiptIds: string[], client?: SupabaseClient): Promise<BookingProposalRow[]> {
  if (receiptIds.length === 0) return [];
  const { data, error } = await db(client).from("booking_proposals").select("*").in("receipt_id", receiptIds);
  if (error) throw new ProposalStoreError("read_many", error.code);
  return (data ?? []) as BookingProposalRow[];
}

/**
 * Saves a fresh proposal. Inserts when the receipt has none, replaces it
 * only while it is still proposed or failed. Returns the row now stored
 * (which may be a posted one another request saved meanwhile).
 */
export async function saveProposal(
  input: { receiptId: string; organizationId: string; proposal: Proposal },
  client?: SupabaseClient,
): Promise<BookingProposalRow> {
  const { receiptId, organizationId, proposal } = input;
  const values = {
    voucher: { ...proposal.voucher, reason: proposal.reason } satisfies StoredVoucher,
    source: proposal.source,
    confidence: proposal.confidence,
    notes: proposal.notes,
    proposed_account: proposal.debitAccount,
    status: "proposed" as const,
    error_code: null,
    edited: false,
  };
  const c = db(client);
  const { data: inserted, error: insertError } = await c
    .from("booking_proposals")
    .insert({ receipt_id: receiptId, organization_id: organizationId, marker: bookingMarker(receiptId), ...values })
    .select("*");
  if (!insertError) return (inserted as BookingProposalRow[])[0];
  if (insertError.code !== "23505") throw new ProposalStoreError("insert", insertError.code);

  const { data: updated, error: updateError } = await c
    .from("booking_proposals")
    .update(values)
    .eq("receipt_id", receiptId)
    .in("status", [...REBUILDABLE])
    .select("*");
  if (updateError) throw new ProposalStoreError("update", updateError.code);
  const row = (updated as BookingProposalRow[] | null)?.[0];
  if (row) return row;
  const current = await getProposal(receiptId, client);
  if (!current) throw new ProposalStoreError("vanished");
  return current;
}

/**
 * proposed|failed → approved, only if the row is still the one the person
 * saw (updated_at). Null when someone else moved it first.
 */
export async function approveProposal(
  input: {
    receiptId: string;
    expectedUpdatedAt: string;
    voucher: StoredVoucher;
    source: Proposal["source"];
    confidence: number;
    notes: string[];
    edited: boolean;
    approvedBy: string;
  },
  client?: SupabaseClient,
): Promise<BookingProposalRow | null> {
  const { data, error } = await db(client)
    .from("booking_proposals")
    .update({
      status: "approved",
      voucher: input.voucher,
      source: input.source,
      confidence: input.confidence,
      notes: input.notes,
      edited: input.edited,
      approved_by: input.approvedBy,
      approved_at: new Date().toISOString(),
      error_code: null,
    })
    .eq("receipt_id", input.receiptId)
    .eq("updated_at", input.expectedUpdatedAt)
    .in("status", [...REBUILDABLE])
    .select("*");
  if (error) throw new ProposalStoreError("approve", error.code);
  return (data as BookingProposalRow[] | null)?.[0] ?? null;
}

/** approved → posting. Null when another request claimed it. */
export async function claimForPosting(id: string, client?: SupabaseClient): Promise<BookingProposalRow | null> {
  const { data, error } = await db(client)
    .from("booking_proposals")
    .update({ status: "posting", posting_started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .select("*");
  if (error) throw new ProposalStoreError("claim", error.code);
  return (data as BookingProposalRow[] | null)?.[0] ?? null;
}

export async function updateProposal(
  id: string,
  values: Partial<
    Pick<
      BookingProposalRow,
      | "status"
      | "error_code"
      | "fortnox_file_id"
      | "fortnox_voucher_series"
      | "fortnox_voucher_number"
      | "fortnox_financial_year"
      | "file_connected"
      | "posted_at"
    >
  >,
  options: { fromStatus?: BookingProposalRow["status"][] } = {},
  client?: SupabaseClient,
): Promise<boolean> {
  let q = db(client).from("booking_proposals").update(values).eq("id", id);
  if (options.fromStatus) q = q.in("status", options.fromStatus);
  const { data, error } = await q.select("id");
  if (error) throw new ProposalStoreError("update_state", error.code);
  return (data ?? []).length > 0;
}

/** Rows the daily job looks at: lost answers, stalled posts, files not attached. */
export async function proposalsNeedingAttention(olderThanIso: string, client?: SupabaseClient): Promise<BookingProposalRow[]> {
  const { data, error } = await db(client)
    .from("booking_proposals")
    .select("*")
    .or("status.in.(approved,posting,unknown),and(status.eq.posted,file_connected.eq.false)")
    .lt("updated_at", olderThanIso)
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) throw new ProposalStoreError("attention", error.code);
  return (data ?? []) as BookingProposalRow[];
}
