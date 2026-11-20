// Booking agent types (src/lib/accounting/). Pure, client-safe: the
// receipt sheet renders a proposal from these.

/** One voucher row. Exactly one of debit/credit is non-zero. Amounts in SEK. */
export type VoucherRow = {
  account: string;
  debit: number;
  credit: number;
};

/** What the agent proposes and a person approves (booking_proposals.voucher). */
export type ProposedVoucher = {
  /** "YYYY-MM-DD", the receipt's printed day. */
  transactionDate: string;
  description: string;
  series: string;
  /** Fortnox financial year id the date falls in. */
  financialYearId: number;
  rows: VoucherRow[];
  /** The receipt's amount in SEK (the credit row). */
  totalSek: number;
};

export type FortnoxAccount = { number: string; description: string; active: boolean };
export type FinancialYear = { id: number; from: string; to: string };

/** What the agent reads from the company's Fortnox before proposing. */
export type BookingContext = {
  accounts: ReadonlyMap<string, FortnoxAccount>;
  financialYears: readonly FinancialYear[];
  /** Last locked day ("YYYY-MM-DD"), or null. Nothing may be posted on or before it. */
  lockedThrough: string | null;
  voucherSeries: readonly string[];
};

export type BookingSettings = {
  voucherSeries: string | null;
  creditAccountCompany: string | null;
  creditAccountEmployee: string | null;
};

/**
 * Why the agent won't propose: a person must look. Each code has a sentence
 * in BLOCK_MESSAGES (src/lib/accounting/messages.ts).
 */
export type BookingBlock =
  | "not_confirmed"
  | "not_approved"
  | "already_booked"
  | "company_not_sek"
  | "settings_missing"
  | "series_unknown"
  | "no_date"
  | "no_sek_amount"
  | "refund"
  | "no_financial_year"
  | "period_locked"
  | "vat_inconsistent"
  | "vat_rate_unknown"
  | "account_inactive"
  | "credit_account_inactive"
  | "vat_account_inactive"
  | "no_account"
  | "unbalanced";

/** Things a person should know before approving. */
export type BookingNote =
  // A foreign receipt converted at the ECB rate of the day, not the bank's.
  | "fx_estimate"
  // Representation booked whole on the non-deductible account: VAT on up to
  // 300 kr per person may be deductible, the accountant decides.
  | "representation_vat"
  // Foreign VAT isn't Swedish input VAT: it stays in the cost.
  | "foreign_vat_in_cost"
  // The account was chosen by the model, not by a rule or the company's history.
  | "model_choice";

export type BookingSource = "override" | "memory" | "category" | "model" | "person";

export type ModelChoice = { account: string; reason: string; confidence: number };
