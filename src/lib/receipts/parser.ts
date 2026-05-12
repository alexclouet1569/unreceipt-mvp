// SERVER-ONLY. Canonical-field extractor for inbound receipts.
//
// THIS IS A SHIM. The full implementation lives in plan step 5 (paper +
// OCR), which will land in a separate PR and replace the body of this
// module with a real dispatch: regex-first for known templates →
// LLM-extract fallback → Zod validation. Step 6 (this PR) only depends
// on the *shape* of `parseReceipt({ kind, raw })`, so we define the
// surface area now and keep the body intentionally dumb.
//
// Contract:
//   * Returns { status: 'ok', fields } when all required canonical
//     fields could be extracted with reasonable confidence.
//   * Returns { status: 'pending_review' } when one or more required
//     fields could not be extracted — the intake handler still inserts
//     a row with nullable canonical fields so the user can complete it.
//   * THROWS on transport / catastrophic failure (network down, LLM
//     returned non-JSON). The webhook handler catches and falls back
//     to 'pending_review'.

export type ParseInput =
  | { kind: "email"; raw: EmailRaw }
  | { kind: "sms"; raw: SmsRaw }
  | { kind: "paper"; raw: PaperRaw };

export type EmailRaw = {
  from: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
};

export type SmsRaw = {
  from: string;
  body: string;
};

export type PaperRaw = {
  ocrText: string;
};

export type CanonicalReceiptFields = {
  merchant_name: string;
  purchased_at: string; // ISO timestamp
  total: number;
  currency: string;
  subtotal?: number | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  category?: string | null;
  payment_method?: string | null;
  card_last_four?: string | null;
  notes?: string | null;
  parse_confidence: number;
};

export type ParseResult =
  | { status: "ok"; fields: CanonicalReceiptFields }
  | { status: "pending_review" };

// Step 5 will replace this body. Until then we always defer to manual
// review — the intake handler still creates a row, surfaces it on /app,
// and lets the user complete the fields. Returning pending_review here
// is safe (no field data is invented) and lets step 6 ship its tests
// today.
export async function parseReceipt(input: ParseInput): Promise<ParseResult> {
  void input;
  return { status: "pending_review" };
}
