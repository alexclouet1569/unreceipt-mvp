/**
 * Receipt trust status — computed at write time from the canonical
 * fields + parser confidence, then persisted on the row.
 *
 * Rule (plan step 9): a receipt is `pending_review` when the parser's
 * self-reported confidence is below 0.75 OR any required canonical
 * field (merchant_name, purchased_at-or-receipt_date, total) is null /
 * empty. Anything else is `verified`.
 *
 * Pure function — no I/O, safe to import from any layer. The intake
 * handlers feed it the prospective row right before insert. The
 * customer-side update flow re-runs it whenever fields change so a
 * completed row flips back to 'verified' automatically.
 */

import type { ReceiptStatus } from "@/lib/types";

export const PENDING_REVIEW_CONFIDENCE_THRESHOLD = 0.75;

export type ReceiptStatusInput = {
  merchant_name?: string | null;
  purchased_at?: string | null;
  receipt_date?: string | null;
  total?: number | null;
  parse_confidence?: number | null;
};

export type RequiredField = "merchant" | "purchased_at" | "total";

// How a missing field is named on screen ("Missing: amount, date").
export const REQUIRED_FIELD_LABEL: Record<RequiredField, string> = {
  merchant: "merchant",
  total: "amount",
  purchased_at: "date",
};

/** "amount and date", "merchant, amount and date". */
export function missingFieldsText(fields: RequiredField[]): string {
  // In the order the form shows them.
  const order: RequiredField[] = ["merchant", "total", "purchased_at"];
  const names = order.filter((f) => fields.includes(f)).map((f) => REQUIRED_FIELD_LABEL[f]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function computeReceiptStatus(input: ReceiptStatusInput): ReceiptStatus {
  return missingRequiredFields(input).length > 0 ||
    isLowConfidence(input.parse_confidence)
    ? "pending_review"
    : "verified";
}

export function missingRequiredFields(input: ReceiptStatusInput): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!input.merchant_name || input.merchant_name.trim() === "") {
    missing.push("merchant");
  }
  // Either canonical timestamp or legacy date is acceptable — the WOZ
  // admin paste form sets only receipt_date, and that's still trustworthy.
  if (!input.purchased_at && !input.receipt_date) {
    missing.push("purchased_at");
  }
  if (input.total == null || !Number.isFinite(input.total)) {
    missing.push("total");
  }
  return missing;
}

function isLowConfidence(confidence: number | null | undefined): boolean {
  if (confidence == null) return false;
  return confidence < PENDING_REVIEW_CONFIDENCE_THRESHOLD;
}
