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
// VAT follows the export's rule (vatAccountFor): input VAT (2640) only for a
// SEK receipt, a Swedish rate and a deductible category. Representation is
// booked whole on its account, foreign VAT stays in the cost. A SEK receipt
// with VAT at an unreadable or foreign rate is refused: guessing would put
// VAT in the wrong place in the company's books.

import { BAS_BY_CATEGORY, VAT_INPUT_ACCOUNT, basAccountFor } from "@/lib/bookkeeping/bas-map";
import { INPUT_VAT_CURRENCY } from "@/lib/bookkeeping/rules";
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
> & { paid_by?: Receipt["paid_by"]; approval_status?: Receipt["approval_status"] };

export type ProposalInput = {
  receipt: ProposalReceipt;
  /** organizations.currency */
  companyCurrency: string;
  context: BookingContext;
  settings: BookingSettings | null;
  memoryAccount?: string | null;
  modelChoice?: ModelChoice | null;
  personAccount?: string | null;
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

/** The SEK amount to book, and whether it is an ECB estimate. */
function sekAmount(r: ProposalReceipt): { amount: number; estimate: boolean } | null {
  if (r.currency === INPUT_VAT_CURRENCY) {
    const total = Number(r.total);
    return Number.isFinite(total) ? { amount: round2(total), estimate: false } : null;
  }
  if (r.home_currency !== INPUT_VAT_CURRENCY || r.home_total == null) return null;
  const home = Number(r.home_total);
  if (!Number.isFinite(home)) return null;
  return { amount: round2(home), estimate: r.fx_source !== "manual" };
}

export function proposeBooking(input: ProposalInput): ProposalResult {
  const { receipt: r, context: ctx, settings } = input;
  const blocks: BookingBlock[] = [];
  const notes: BookingNote[] = [];

  // Who and what: only a confirmed, approved receipt nobody booked yet.
  if (r.status !== "verified") blocks.push("not_confirmed");
  if (r.approval_status && r.approval_status !== "approved") blocks.push("not_approved");
  if (r.booked_at) blocks.push("already_booked");
  if (input.companyCurrency !== INPUT_VAT_CURRENCY) blocks.push("company_not_sek");

  const series = settings?.voucherSeries ?? null;
  const creditAccount = r.paid_by === "employee" ? settings?.creditAccountEmployee : settings?.creditAccountCompany;
  if (!series || !creditAccount) blocks.push("settings_missing");
  else if (!ctx.voucherSeries.includes(series)) blocks.push("series_unknown");

  // When: a printed day inside an open financial year.
  const day = printedDay(r);
  let financialYearId: number | null = null;
  if (!day) {
    blocks.push("no_date");
  } else {
    const year = ctx.financialYears.find((y) => y.from <= day && day <= y.to);
    if (!year) blocks.push("no_financial_year");
    else financialYearId = year.id;
    if (ctx.lockedThrough && day <= ctx.lockedThrough) blocks.push("period_locked");
  }

  // How much, in SEK.
  const sek = sekAmount(r);
  if (!sek) blocks.push("no_sek_amount");
  else if (sek.amount <= 0) blocks.push("refund");
  if (sek?.estimate) notes.push("fx_estimate");

  // VAT.
  const category = BAS_BY_CATEGORY[r.category] ? r.category : "other";
  const deductible = basAccountFor({ category, bas_account: null }).inputVatDeductible;
  let inputVat = 0;
  if (r.currency === INPUT_VAT_CURRENCY) {
    const lines = vatLinesFor(r);
    if (!vatLinesConsistent(lines, r.tax_amount)) blocks.push("vat_inconsistent");
    const withVat = lines.filter((l) => l.vat > 0);
    if (withVat.some((l) => !isSwedishRate(l.rate))) blocks.push("vat_rate_unknown");
    const vatSum = round2(withVat.reduce((acc, l) => acc + l.vat, 0));
    if (sek && vatSum >= sek.amount && vatSum > 0) blocks.push("vat_inconsistent");
    if (deductible) inputVat = vatSum;
    else if (vatSum > 0) notes.push("representation_vat");
  } else if (Number(r.tax_amount) > 0 || (r.vat_lines ?? []).some((l) => Number(l?.vat) > 0)) {
    notes.push("foreign_vat_in_cost");
  }
  if (category === "client_entertainment" && !notes.includes("representation_vat")) notes.push("representation_vat");

  if (creditAccount && !blocks.includes("settings_missing") && !isActive(ctx, creditAccount)) {
    blocks.push("credit_account_inactive");
  }
  if (inputVat > 0 && !isActive(ctx, VAT_INPUT_ACCOUNT)) blocks.push("vat_account_inactive");

  // Which expense account.
  let debit: { account: string; source: BookingSource; confidence: number; reason: string | null } | null = null;
  const override = r.bas_account?.trim() || null;
  if (input.personAccount) {
    if (isActive(ctx, input.personAccount)) {
      debit = { account: input.personAccount, source: "person", confidence: 1, reason: null };
    } else {
      blocks.push("account_inactive");
    }
  } else if (override) {
    if (isActive(ctx, override)) debit = { account: override, source: "override", confidence: 1, reason: null };
    else blocks.push("account_inactive");
  } else if (isActive(ctx, input.memoryAccount)) {
    debit = { account: input.memoryAccount, source: "memory", confidence: 0.9, reason: null };
  } else {
    const byCategory = BAS_BY_CATEGORY[category].account;
    if (category !== "other" && isActive(ctx, byCategory)) {
      debit = { account: byCategory, source: "category", confidence: 0.75, reason: null };
    } else if (input.modelChoice) {
      if (isActive(ctx, input.modelChoice.account)) {
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

  if (blocks.length > 0 || !debit || !sek || !day || financialYearId == null || !series || !creditAccount) {
    return { kind: "blocked", blocks: blocks.length > 0 ? [...new Set(blocks)] : ["no_account"] };
  }

  const cost = round2(sek.amount - inputVat);
  const rows: VoucherRow[] = [{ account: debit.account, debit: cost, credit: 0 }];
  if (inputVat > 0) rows.push({ account: VAT_INPUT_ACCOUNT, debit: inputVat, credit: 0 });
  rows.push({ account: creditAccount, debit: 0, credit: sek.amount });
  if (!isBalanced(rows)) return { kind: "blocked", blocks: ["unbalanced"] };

  let confidence = debit.confidence;
  if (notes.includes("fx_estimate")) confidence -= 0.1;
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;

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
