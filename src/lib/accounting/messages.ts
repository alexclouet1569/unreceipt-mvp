// What the booking agent's codes mean, in the product's language (English).
// Client-safe: the receipt sheet, Settings and the firm portal show these.

import type { BookingBlock, BookingNote } from "./types";

export const BLOCK_MESSAGES: Record<BookingBlock, string> = {
  not_confirmed: "Confirm the receipt first.",
  not_approved: "Waiting for approval inside the company.",
  already_booked: "Already marked as booked.",
  company_not_sek: "Fortnox books in kronor: the company's currency isn't SEK.",
  settings_missing: "Choose the voucher series and payment accounts in the Fortnox settings.",
  series_unknown: "The chosen voucher series isn't in Fortnox any more. Check the Fortnox settings.",
  no_date: "The receipt has no date.",
  no_sek_amount: "No amount in kronor yet. Add the amount from the bank statement.",
  refund: "A refund or a zero amount: book it by hand in Fortnox.",
  no_financial_year: "The date isn't in a financial year in Fortnox.",
  period_locked: "The date is in a locked period in Fortnox.",
  vat_inconsistent: "The VAT doesn't add up. Check the VAT lines.",
  vat_rate_unknown: "The VAT rate isn't a Swedish one (25, 12 or 6 %). Check the VAT lines.",
  account_inactive: "The chosen account isn't active in Fortnox.",
  credit_account_inactive: "The payment account isn't active in Fortnox. Check the Fortnox settings.",
  vat_account_inactive: "Account 2640 (input VAT) isn't active in Fortnox.",
  no_account: "No expense account could be chosen. Pick one.",
  unbalanced: "The voucher doesn't balance.",
};

export const NOTE_MESSAGES: Record<BookingNote, string> = {
  fx_estimate: "Converted at the ECB rate of the day, not your bank's. Check against the bank statement.",
  representation_vat:
    "Representation is booked whole without input VAT. VAT on up to 300 kr per person may be deductible: adjust in Fortnox if so.",
  foreign_vat_in_cost: "Foreign VAT isn't Swedish input VAT: it stays in the cost.",
  model_choice: "The account was suggested by AI from your chart of accounts.",
};

export function errorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code.startsWith("voucher_refused")) return "Fortnox refused the voucher. Nothing was booked.";
  if (code.startsWith("file_refused") || code === "file_upload_failed") return "Fortnox didn't take the receipt file. Nothing was booked.";
  if (code === "not_created") return "Fortnox didn't create the voucher. Nothing was booked.";
  if (code === "file_not_attached") return "Booked. The receipt file will be attached shortly.";
  if (code === "needs_reconnect" || code === "not_connected") return "The Fortnox connection needs to be renewed.";
  return "Something went wrong. Nothing was booked.";
}

export const SOURCE_LABEL: Record<string, string> = {
  person: "Your choice",
  override: "Chosen by the accountant",
  memory: "As before for this merchant",
  category: "From the category",
  model: "Suggested by AI",
};

// Where a Fortnox connect flow ended (?fortnox=…&reason=…, src/lib/accounting/oauth.ts).
const FORTNOX_RESULT_TEXT: Record<string, string> = {
  denied: "Fortnox wasn't connected: the request was declined.",
  expired: "That took too long. Start again.",
  wrong_browser: "Finish connecting in the browser where you started.",
  wrong_account: "You were signed in as someone else when Fortnox answered. Start again.",
  not_allowed: "Only an owner of the company or its accounting firm can connect Fortnox.",
  not_configured: "Fortnox isn't available yet.",
  scope_missing: "Every permission is needed on Fortnox's screen. Start again and keep them all.",
  wrong_company: "That Fortnox company has another org number than this company. Choose the right one.",
  rate_limited: "Many tries in a short time. Try again later.",
  provider_unavailable: "Fortnox didn't answer. Try again later.",
};

export function fortnoxResultText(result: string | null, reason: string | null): { ok: boolean; text: string } | null {
  if (result === "connected") return { ok: true, text: "Fortnox is connected." };
  if (result === "error") return { ok: false, text: FORTNOX_RESULT_TEXT[reason ?? ""] ?? "Fortnox couldn't be connected. Try again." };
  return null;
}

