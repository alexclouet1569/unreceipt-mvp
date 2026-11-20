// What the booking agent's codes mean, in the product's language (English).
// Client-safe: the receipt sheet, Settings and the firm portal show these.

import {
  REPRESENTATION_VAT_BASE_PER_PERSON_SEK,
  SIMPLIFIED_INVOICE_MAX_SEK,
  SWEDISH_VAT_RATES,
} from "@/lib/bookkeeping/rules";
import type { BookingBlock, BookingNote } from "./types";

const RATES = SWEDISH_VAT_RATES.join(", ");
const MAX = SIMPLIFIED_INVOICE_MAX_SEK.toLocaleString("en-US");

export const BLOCK_MESSAGES: Record<BookingBlock, string> = {
  not_confirmed: "Confirm the receipt first.",
  not_approved: "Waiting for approval inside the company.",
  already_booked: "Already marked as booked.",
  already_exported:
    "Already exported to the accountant, who may have booked it by hand. Check Fortnox, then mark it booked instead.",
  no_merchant: "Add the merchant: a voucher must name who was paid.",
  paid_by_missing: "Choose who paid.",
  company_not_sek: "Fortnox books in kronor: the company's currency isn't SEK.",
  settings_missing: "Choose the voucher series and payment accounts in the Fortnox settings.",
  series_unknown: "The chosen voucher series isn't in Fortnox any more. Check the Fortnox settings.",
  vat_status_missing: "Say in the Fortnox settings whether the company deducts VAT.",
  vat_partial: "The company deducts VAT only in part: book receipts with VAT by hand in Fortnox.",
  over_simplified_invoice: `Over ${MAX} kr: VAT may only be deducted with a full invoice naming your company. Check the invoice and book it by hand in Fortnox.`,
  reverse_charge_check:
    "Possibly bought from abroad with reverse charge (you report the VAT yourself). Book it by hand in Fortnox.",
  fx_bank_amount_needed: "Add the amount in kronor from the bank or card statement first: Fortnox gets what was really paid.",
  account_not_cost: "Choose an expense account (classes 4 to 7).",
  no_date: "The receipt has no valid date.",
  no_sek_amount: "No amount in kronor yet. Add the amount from the bank statement.",
  refund: "A refund or a zero amount: book it by hand in Fortnox.",
  no_financial_year: "The date isn't in a financial year in Fortnox.",
  period_locked: "The date is in a locked period in Fortnox.",
  vat_inconsistent: "The VAT doesn't add up with the amounts. Check the VAT lines.",
  vat_rate_unknown: `The VAT rate couldn't be read or isn't a Swedish one (${RATES} %). Check the VAT lines.`,
  account_inactive: "The chosen account isn't active in Fortnox.",
  credit_account_inactive: "The payment account isn't active in Fortnox. Check the Fortnox settings.",
  vat_account_inactive: "Account 2640 (input VAT) isn't active in Fortnox.",
  no_account: "No expense account could be chosen. Pick one.",
  unbalanced: "The voucher doesn't balance.",
};

export const NOTE_MESSAGES: Record<BookingNote, string> = {
  representation_vat: `Representation is booked whole without input VAT. VAT on food and drink may be deductible on up to ${REPRESENTATION_VAT_BASE_PER_PERSON_SEK} kr excluding VAT per person and occasion (or a standard amount); note the guests and purpose, and adjust in Fortnox if so.`,
  restricted_account_vat:
    "This account (representation or a passenger car) gets no input VAT automatically: the VAT stays in the cost. Adjust in Fortnox if part of it is deductible.",
  foreign_vat_in_cost: "Foreign VAT isn't Swedish input VAT: it stays in the cost.",
  vat_not_deducted: "The company doesn't deduct VAT (Fortnox settings): the VAT stays in the cost.",
  no_vat_read: "No VAT was read on this receipt: it is booked whole as a cost. Check that it really has none.",
  check_deductibility: "Meals and transport can be private, staff or car costs. Check before approving.",
  possible_asset: "A large amount: if this is equipment, it may need to be booked as an asset instead.",
  digital_copy:
    "Fortnox gets UnReceipt's digital receipt; the original (an email or a typed receipt) stays in UnReceipt. Export it before you stop using UnReceipt.",
  paid_by_assumed: "Shown as paid by the company. Choose who paid before approving.",
  model_choice: "The account was suggested by AI from your chart of accounts.",
};

export function errorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code.startsWith("voucher_refused")) return "Fortnox refused the voucher. Nothing was booked.";
  if (code.startsWith("file_refused") || code === "file_upload_failed") return "Fortnox didn't take the receipt file. Nothing was booked.";
  if (code === "not_created") return "Fortnox didn't create the voucher. Nothing was booked.";
  if (code === "file_not_attached") return "Booked. The receipt file will be attached shortly.";
  if (code === "needs_reconnect" || code === "not_connected") return "The Fortnox connection needs to be renewed.";
  if (code === "connection_changed") return "Fortnox was reconnected since this was approved. Nothing was booked: check and approve again.";
  if (code === "approver_changed") return "The person who approved may no longer approve for this company. Nothing was booked: approve again.";
  if (code === "file_unavailable") return "The receipt's original file couldn't be read. Nothing was booked: try again.";
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

