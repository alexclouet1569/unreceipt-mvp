// SERVER-ONLY. Shared parser module the three intake paths reuse:
//
//   * paper  — wraps the Claude-vision OCR extractor (step 5)
//   * email  — structured-template-first + LLM-extract fallback (step 6 stub)
//   * sms    — regex-first + LLM-extract fallback (step 7 stub)
//
// Every strategy returns the same `ParseResult` shape — canonical fields
// matching the relevant columns on public.receipts, plus a 0..1 confidence
// score the intake handler uses to decide whether to auto-insert or land
// the row in a "review needed" slice.
//
// Never import from a "use client" component — extractReceipt requires
// ANTHROPIC_API_KEY which is server-only.

import { z } from "zod";
import { extractReceipt, type OcrMediaType, type OcrResult } from "@/lib/ocr";
import {
  CATEGORY_KEYS,
  CURRENCY_OPTIONS,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/receipt-format";

// Canonical fields the intake parsers all produce. Mirrors the relevant
// slice of public.receipts (step 3 schema). All nullable so a low-confidence
// parse can land with required fields missing — the inbox surfaces those
// rows for review instead of dropping them.
const CanonicalReceiptSchema = z.object({
  merchant_name: z.string().min(1).nullable(),
  total_amount: z.number().positive().nullable(),
  currency: z.enum(CURRENCY_OPTIONS).nullable(),
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]).nullable(),
  vat_amount: z.number().nullable(),
  vat_rate_pct: z.number().nullable(),
  payment_method: z.string().nullable(),
  notes: z.string().nullable(),
});

export type CanonicalReceiptFields = z.infer<typeof CanonicalReceiptSchema>;

export type ParseResult = {
  fields: CanonicalReceiptFields;
  /** 0..1 — strategy self-report × schema-validation pass-rate. */
  confidence: number;
  /** Strategy decided the input clearly isn't a receipt — no row should be created. */
  not_a_receipt: boolean;
};

export type ParseInput =
  | { kind: "paper"; imageBase64: string; mediaType: OcrMediaType }
  | { kind: "email"; raw: string; senderDomain?: string }
  | { kind: "sms"; raw: string };

/**
 * Threshold the intake handlers use to flag low-confidence parses for
 * review. Q3 in the plan settled on 0.8 — strict to start, easy to dial
 * down once we see real distribution.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

export async function parseReceipt(input: ParseInput): Promise<ParseResult> {
  switch (input.kind) {
    case "paper":
      return parsePaper(input);
    case "email":
      return parseEmail(input);
    case "sms":
      return parseSms(input);
  }
}

async function parsePaper(
  input: Extract<ParseInput, { kind: "paper" }>,
): Promise<ParseResult> {
  // OCR failures (network, model, malformed JSON) propagate up so the
  // caller can surface a 500 rather than a silent confidence=0 row.
  // The intake handlers in steps 5–7 are expected to wrap their
  // parseReceipt() calls in their own try/catch.
  const ocr: OcrResult = await extractReceipt(input.imageBase64, input.mediaType);

  if (ocr.not_a_receipt) {
    return { fields: emptyFields(), confidence: 0, not_a_receipt: true };
  }

  const candidate: CanonicalReceiptFields = {
    merchant_name:
      typeof ocr.merchant === "string" && ocr.merchant.trim().length > 0
        ? ocr.merchant.trim()
        : null,
    total_amount:
      typeof ocr.amount === "number" && Number.isFinite(ocr.amount) && ocr.amount > 0
        ? ocr.amount
        : null,
    currency: (CURRENCY_OPTIONS as readonly string[]).includes(ocr.currency ?? "")
      ? (ocr.currency as CurrencyCode)
      : null,
    receipt_date:
      typeof ocr.receipt_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ocr.receipt_date)
        ? ocr.receipt_date
        : null,
    category: (CATEGORY_KEYS as readonly string[]).includes(ocr.category ?? "")
      ? (ocr.category as CategoryKey)
      : null,
    vat_amount:
      typeof ocr.tax_amount === "number" && Number.isFinite(ocr.tax_amount)
        ? ocr.tax_amount
        : null,
    vat_rate_pct:
      typeof ocr.tax_rate === "number" && Number.isFinite(ocr.tax_rate)
        ? ocr.tax_rate
        : null,
    payment_method:
      typeof ocr.payment_method === "string" && ocr.payment_method.trim().length > 0
        ? ocr.payment_method.trim()
        : null,
    notes: null,
  };

  const validated = CanonicalReceiptSchema.safeParse(candidate);
  const fields = validated.success ? validated.data : candidate;

  // Confidence = OCR self-report × schema-validation pass-rate.
  //   * OCR omits its own `confidence`     → fall back to 0.7 (moderate)
  //   * Schema validation passes           → 1.0
  //   * Schema validation fails (any field issue) → 0.5
  const ocrConfidence =
    typeof ocr.confidence === "number" ? clamp01(ocr.confidence) : 0.7;
  const passRate = validated.success ? 1 : 0.5;

  return {
    fields,
    confidence: round(ocrConfidence * passRate, 2),
    not_a_receipt: false,
  };
}

async function parseEmail(
  _input: Extract<ParseInput, { kind: "email" }>,
): Promise<ParseResult> {
  // Stub — step 6 fills this in (structured-template-first for known senders
  // like Stripe / Uber / Amazon, LLM-extract on the cleaned plain-text body
  // otherwise). Returning confidence=0 means any caller that wires this up
  // before step 6 will route everything to "review needed", which is the
  // intended fail-safe.
  return { fields: emptyFields(), confidence: 0, not_a_receipt: false };
}

async function parseSms(
  _input: Extract<ParseInput, { kind: "sms" }>,
): Promise<ParseResult> {
  // Stub — step 7. Regex-first for known Swedish bank tx-confirmation
  // patterns, LLM-extract fallback. See parseEmail for the same rationale.
  return { fields: emptyFields(), confidence: 0, not_a_receipt: false };
}

function emptyFields(): CanonicalReceiptFields {
  return {
    merchant_name: null,
    total_amount: null,
    currency: null,
    receipt_date: null,
    category: null,
    vat_amount: null,
    vat_rate_pct: null,
    payment_method: null,
    notes: null,
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number, digits: number) => {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
};
