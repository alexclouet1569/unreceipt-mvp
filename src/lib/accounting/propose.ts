// The booking agent's decision: a receipt → a balanced Fortnox voucher, or
// the reasons a person must look. Pure: no I/O, so every rule is tested.
//
// Order of the expense account (the first that is active in the company's
// chart of accounts wins):
//   1. person    an account a person picked in the receipt sheet
//   2. override  receipts.bas_account, set by the firm (refuses when
//                inactive rather than overriding a human choice)
//   3. memory    what the company approved for this merchant before
//   4. category  the category's BAS account (bas-map.ts), except "other"
//   5. model     Claude's choice from the company's chart (propose-model.ts),
//                asked only when nothing above applies ("needs_model")
//
// Input VAT (2640) only when every check holds (compliance review
// 2026-11-20): the company deducts VAT in full (accounting_settings), a SEK
// receipt, at most SIMPLIFIED_INVOICE_MAX_SEK (a till receipt is a simplified
// invoice), Swedish rates that match the receipt's own net and VAT, a
// deductible category AND a final account that isn't representation or a
// passenger car. Otherwise the VAT stays in the cost with a note, or the
// agent refuses and a person books it. Never guess VAT into the books.
//
// Also refused: a receipt already exported (the firm may have typed it into
// Fortnox), no merchant (the voucher must name the counterparty), possible
// reverse charge (foreign software/other, or a foreign VAT number without
// VAT), and an ECB estimate (the card was settled at the bank's rate: the
// bank amount must be typed first).

import { BAS_BY_CATEGORY, VAT_INPUT_ACCOUNT, basAccountFor } from "@/lib/bookkeeping/bas-map";
import {
  ASSET_NOTE_THRESHOLD_SEK,
  INPUT_VAT_CURRENCY,
  NO_AUTO_INPUT_VAT_ACCOUNT_PREFIXES,
  REVERSE_CHARGE_CATEGORIES,
  SIMPLIFIED_INVOICE_MAX_SEK,
  VAT_RATE_CHECK_TOLERANCE_PP,
  VAT_SPLIT_TOLERANCE,
} from "@/lib/bookkeeping/rules";
import { isSwedishRate, vatLinesConsistent, vatLinesFor } from "@/lib/bookkeeping/vat-lines";
import { printedDay } from "@/lib/receipts/printed-day";
import type { Receipt } from "@/lib/types";
import type {
  BookingBlock,
  BookingContext,
  BookingNote,
  BookingSettings,
  BookingSource,
  ModelChoice,
  ProposedVoucher,
  VoucherRow,
} from "./types";

export type ProposalReceipt = Pick<
  Receipt,
  | "id"
  | "status"
  | "merchant_name"
  | "category"
  | "currency"
  | "total"
  | "tax_amount"
  | "tax_rate"
  | "vat_lines"
  | "home_total"
  | "home_currency"
  | "fx_source"
  | "receipt_date"
  | "purchased_at"
  | "bas_account"
  | "booked_at"
> & {
  paid_by?: Receipt["paid_by"];
  approval_status?: Receipt["approval_status"];
  exported_at?: Receipt["exported_at"];
  merchant_vat_number?: Receipt["merchant_vat_number"];
};

export type ProposalInput = {
  receipt: ProposalReceipt;
  /** organizations.currency */
  companyCurrency: string;
  context: BookingContext;
  settings: BookingSettings | null;
  memoryAccount?: string | null;
  modelChoice?: ModelChoice | null;
  personAccount?: string | null;
  /** Who paid, as a person said when approving (else receipts.paid_by). */
  paidBy?: "employee" | "company" | null;
  /** At approval: refuse when nobody said who paid. */
  requirePaidBy?: boolean;
  /** False when Fortnox will get UnReceipt's digital receipt instead of the original. */
  originalAttached?: boolean;
};

export type Proposal = {
  voucher: ProposedVoucher;
  source: BookingSource;
  confidence: number;
  notes: BookingNote[];
  debitAccount: string;
  /** The model's one-line reason, when the model chose. */
  reason: string | null;
};

export type ProposalResult =
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "blocked"; blocks: BookingBlock[] }
  | { kind: "needs_model" };

const round2 = (n: number) => Math.round(n * 100) / 100;
const ACCOUNT = /^[0-9]{4}$/;
/** Expense accounts (BAS classes 4–7): the only debit a person or the agent may choose. */
const COST_ACCOUNT = /^[4-7][0-9]{3}$/;

/** The text written into the voucher so a lost answer can be found again. */
export function bookingMarker(receiptId: string): string {
  return `UnReceipt ${receiptId.replace(/-/g, "").toLowerCase().slice(0, 12)}`;
}

export function voucherDescription(merchant: string | null, receiptId: string): string {
  const name = (merchant ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "Kvitto";
  return `${name} · ${bookingMarker(receiptId)}`;
}

function isActive(ctx: BookingContext, account: string | null | undefined): account is string {
  if (!account || !ACCOUNT.test(account)) return false;
  return ctx.accounts.get(account)?.active === true;
}

/** A calendar day that exists ("2026-02-31" doesn't). */
function isRealDay(day: string): boolean {
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

export function restrictsInputVat(account: string): boolean {
  return NO_AUTO_INPUT_VAT_ACCOUNT_PREFIXES.some((p) => account.startsWith(p));
}

/** The SEK amount to book, and whether it is an ECB estimate. */
function sekAmount(r: ProposalReceipt): { amount: number; estimate: boolean } | null {
  if (r.currency === INPUT_VAT_CURRENCY) {
    const total = Number(r.total);
    return r.total != null && Number.isFinite(total) ? { amount: round2(total), estimate: false } : null;
  }
  if (r.home_currency !== INPUT_VAT_CURRENCY || r.home_total == null) return null;
  const home = Number(r.home_total);
  if (!Number.isFinite(home)) return null;
  return { amount: round2(home), estimate: r.fx_source !== "manual" };
}

/**
 * The receipt's VAT, checked against its own amounts: every line at a
 * Swedish rate that matches its net, the lines adding up to the total and
 * to the printed VAT amount. Null with the reason otherwise.
 */
function checkedSekVat(r: ProposalReceipt, total: number): { vat: number; read: boolean } | { block: BookingBlock } {
  const lines = vatLinesFor(r);
  if (!vatLinesConsistent(lines, r.tax_amount)) return { block: "vat_inconsistent" };
  if (lines.some((l) => l.vat < 0 || (l.net != null && l.net < 0))) return { block: "vat_inconsistent" };
  const withVat = lines.filter((l) => l.vat > 0);
  if (withVat.length === 0) return { vat: 0, read: lines.some((l) => l.source !== "none") };
  if (withVat.some((l) => !isSwedishRate(l.rate))) return { block: "vat_rate_unknown" };
  const vat = round2(withVat.reduce((acc, l) => acc + l.vat, 0));
  if (vat >= total) return { block: "vat_inconsistent" };
  for (const l of withVat) {
    // A single line without a net: the rest of the total is its net.
    const net = l.net ?? (lines.length === 1 ? round2(total - l.vat) : null);
    if (net == null || net <= 0) return { block: "vat_inconsistent" };
    if (Math.abs((l.vat / net) * 100 - (l.rate as number)) > VAT_RATE_CHECK_TOLERANCE_PP) return { block: "vat_inconsistent" };
  }
  if (lines.every((l) => l.net != null)) {
    const sum = lines.reduce((acc, l) => acc + (l.net as number) + l.vat, 0);
    if (Math.abs(sum - total) > VAT_SPLIT_TOLERANCE * (lines.length + 1)) return { block: "vat_inconsistent" };
  }
  return { vat, read: true };
}

export function proposeBooking(input: ProposalInput): ProposalResult {
  const { receipt: r, context: ctx, settings } = input;
  const blocks: BookingBlock[] = [];
  const notes: BookingNote[] = [];

  // Who and what: only a confirmed, approved receipt nobody booked or exported yet.
  if (r.status !== "verified") blocks.push("not_confirmed");
  if (r.approval_status && r.approval_status !== "approved") blocks.push("not_approved");
  if (r.booked_at) blocks.push("already_booked");
  // Exported to the firm, who may have typed it into Fortnox already.
  else if (r.exported_at) blocks.push("already_exported");
  if (!r.merchant_name?.trim()) blocks.push("no_merchant");
  if (input.companyCurrency !== INPUT_VAT_CURRENCY) blocks.push("company_not_sek");

  // Who paid: a person's answer, else the receipt's; never a guess at approval.
  const paidBy = input.paidBy ?? r.paid_by ?? null;
  if (!paidBy) {
    if (input.requirePaidBy) blocks.push("paid_by_missing");
    else notes.push("paid_by_assumed");
  }
  const series = settings?.voucherSeries ?? null;
  const creditAccount = paidBy === "employee" ? settings?.creditAccountEmployee : settings?.creditAccountCompany;
  if (!series || !creditAccount) blocks.push("settings_missing");
  else if (!ctx.voucherSeries.includes(series)) blocks.push("series_unknown");

  // When: a real printed day inside an open financial year.
  const day = printedDay(r);
  let financialYearId: number | null = null;
  if (!day || !isRealDay(day)) {
    blocks.push("no_date");
  } else {
    const year = ctx.financialYears.find((y) => y.from <= day && day <= y.to);
    if (!year) blocks.push("no_financial_year");
    else financialYearId = year.id;
    if (ctx.lockedThrough && day <= ctx.lockedThrough) blocks.push("period_locked");
  }

  // How much, in SEK: the bank's amount for a foreign receipt, never the
  // ECB estimate (the card was settled at the bank's rate).
  const sek = sekAmount(r);
  if (!sek) blocks.push("no_sek_amount");
  else if (sek.amount <= 0) blocks.push("refund");
  else if (sek.estimate) blocks.push("fx_bank_amount_needed");

  const category = BAS_BY_CATEGORY[r.category] ? r.category : "other";

  // Reverse charge: services bought from abroad, where the buyer reports
  // the VAT itself. The accountant books those.
  const foreignVatNumber = /^[A-Z]{2}/i.test(r.merchant_vat_number ?? "") && !/^SE/i.test(r.merchant_vat_number ?? "");
  if (r.currency !== INPUT_VAT_CURRENCY && (REVERSE_CHARGE_CATEGORIES as readonly string[]).includes(category)) {
    blocks.push("reverse_charge_check");
  }

  // Which expense account (before the VAT: the VAT depends on it).
  let debit: { account: string; source: BookingSource; confidence: number; reason: string | null } | null = null;
  const override = r.bas_account?.trim() || null;
  const usable = (account: string | null | undefined): account is string =>
    !!account && COST_ACCOUNT.test(account) && isActive(ctx, account);
  if (input.personAccount) {
    if (!COST_ACCOUNT.test(input.personAccount)) blocks.push("account_not_cost");
    else if (!isActive(ctx, input.personAccount)) blocks.push("account_inactive");
    else debit = { account: input.personAccount, source: "person", confidence: 1, reason: null };
  } else if (override) {
    if (!COST_ACCOUNT.test(override)) blocks.push("account_not_cost");
    else if (!isActive(ctx, override)) blocks.push("account_inactive");
    else debit = { account: override, source: "override", confidence: 1, reason: null };
  } else if (usable(input.memoryAccount)) {
    debit = { account: input.memoryAccount, source: "memory", confidence: 0.9, reason: null };
  } else {
    const byCategory = BAS_BY_CATEGORY[category].account;
    if (category !== "other" && usable(byCategory)) {
      debit = { account: byCategory, source: "category", confidence: 0.75, reason: null };
    } else if (input.modelChoice) {
      if (usable(input.modelChoice.account)) {
        const c = Math.max(0, Math.min(0.7, input.modelChoice.confidence));
        debit = { account: input.modelChoice.account, source: "model", confidence: c, reason: input.modelChoice.reason };
        notes.push("model_choice");
      } else {
        blocks.push("no_account");
      }
    } else if (blocks.length === 0) {
      // Nothing else stands in the way: worth asking the model.
      return { kind: "needs_model" };
    }
    // Otherwise the other blocks already say why; the account can wait.
  }

  // VAT.
  let inputVat = 0;
  if (r.currency === INPUT_VAT_CURRENCY && sek && sek.amount > 0) {
    const checked = checkedSekVat(r, sek.amount);
    if ("block" in checked) {
      blocks.push(checked.block);
    } else if (checked.vat === 0) {
      if (foreignVatNumber) blocks.push("reverse_charge_check");
      else notes.push("no_vat_read");
    } else {
      const status = settings?.vatStatus ?? null;
      const categoryDeductible = basAccountFor({ category, bas_account: null }).inputVatDeductible;
      const accountDeductible = debit ? !restrictsInputVat(debit.account) : true;
      if (status === null) blocks.push("vat_status_missing");
      else if (status === "partial") blocks.push("vat_partial");
      else if (status === "none") notes.push("vat_not_deducted");
      else if (!categoryDeductible) notes.push("representation_vat");
      else if (!accountDeductible) notes.push("restricted_account_vat");
      else if (sek.amount > SIMPLIFIED_INVOICE_MAX_SEK) blocks.push("over_simplified_invoice");
      else inputVat = checked.vat;
    }
  } else if (r.currency !== INPUT_VAT_CURRENCY && (Number(r.tax_amount) > 0 || (r.vat_lines ?? []).some((l) => Number(l?.vat) > 0))) {
    notes.push("foreign_vat_in_cost");
  }
  if (category === "client_entertainment" && !notes.includes("representation_vat")) notes.push("representation_vat");
  if (category === "meals" || category === "transport") notes.push("check_deductibility");
  if (input.originalAttached === false) notes.push("digital_copy");

  if (creditAccount && !blocks.includes("settings_missing") && !isActive(ctx, creditAccount)) {
    blocks.push("credit_account_inactive");
  }
  if (inputVat > 0 && !isActive(ctx, VAT_INPUT_ACCOUNT)) blocks.push("vat_account_inactive");

  if (blocks.length > 0 || !debit || !sek || !day || financialYearId == null || !series || !creditAccount) {
    return { kind: "blocked", blocks: blocks.length > 0 ? [...new Set(blocks)] : ["no_account"] };
  }

  const cost = round2(sek.amount - inputVat);
  if (cost > ASSET_NOTE_THRESHOLD_SEK) notes.push("possible_asset");
  const rows: VoucherRow[] = [{ account: debit.account, debit: cost, credit: 0 }];
  if (inputVat > 0) rows.push({ account: VAT_INPUT_ACCOUNT, debit: inputVat, credit: 0 });
  rows.push({ account: creditAccount, debit: 0, credit: sek.amount });
  if (!isBalanced(rows)) return { kind: "blocked", blocks: ["unbalanced"] };

  const confidence = Math.round(Math.max(0, Math.min(1, debit.confidence)) * 100) / 100;

  return {
    kind: "proposal",
    proposal: {
      voucher: {
        transactionDate: day,
        description: voucherDescription(r.merchant_name, r.id),
        series,
        financialYearId,
        rows,
        totalSek: sek.amount,
      },
      source: debit.source,
      confidence,
      notes: [...new Set(notes)],
      debitAccount: debit.account,
      reason: debit.reason,
    },
  };
}

/** Debits equal credits to the öre, every row one-sided and positive. */
export function isBalanced(rows: readonly VoucherRow[]): boolean {
  if (rows.length < 2) return false;
  let debit = 0;
  let credit = 0;
  for (const row of rows) {
    if (!ACCOUNT.test(row.account)) return false;
    if (row.debit < 0 || row.credit < 0) return false;
    if ((row.debit > 0) === (row.credit > 0)) return false;
    debit += Math.round(row.debit * 100);
    credit += Math.round(row.credit * 100);
  }
  return debit === credit && debit > 0;
}
