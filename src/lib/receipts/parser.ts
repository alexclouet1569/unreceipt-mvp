// SERVER-ONLY. Canonical-field extractor for inbound receipts.
//
// Three-tier dispatch:
//   1. Email → try template extractors for known vendors (Uber, Stripe,
//      …) → fall back to LLM-extract on the plain-text body.
//   2. SMS   → try Swedish-bank regex templates → fall back to
//              LLM-extract on the SMS body.
//   3. Paper → LLM-extract on the OCR text (the image OCR happened
//              upstream in /api/capture or the paper-intake handler).
//
// Output is Zod-validated. Required fields are merchant_name,
// purchased_at, total, currency. When any required field is missing,
// or parser confidence < CONFIDENCE_FLOOR, we return pending_review
// — the intake handler still inserts a row so the customer can
// complete it on /app.
//
// THROWS on transport/catastrophic failure (LLM network error, etc).
// The intake handlers catch and fall back to pending_review.

import { z } from "zod";
import { llmExtract, type LlmExtractKind, type LlmExtractResult } from "./llm-extract";
import { EMAIL_TEMPLATES, SMS_TEMPLATES } from "./templates";
import type { PartialFields } from "./templates/types";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import type {
  CanonicalReceiptFields,
  EmailRaw,
  ParseInput,
  ParseResult,
  SmsRaw,
} from "./parser-types";

export type {
  CanonicalReceiptFields,
  EmailRaw,
  ParseInput,
  ParseResult,
  PaperRaw,
  SmsRaw,
} from "./parser-types";

const CONFIDENCE_FLOOR = 0.75;
const TEMPLATE_HIT_CONFIDENCE = 0.95;
const TEMPLATE_PARTIAL_CONFIDENCE = 0.7;

// Zod for the LLM output. Mirrors LlmExtractResult but stricter so a
// hallucinated invalid currency lands as pending_review rather than
// breaking the row insert.
const LlmResultSchema = z
  .object({
    merchant: z.string().min(1).max(200).optional(),
    amount: z.number().positive().max(1_000_000).optional(),
    currency: z.enum(CURRENCY_OPTIONS).optional(),
    receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    receipt_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    category: z.enum(CATEGORY_KEYS as [string, ...string[]]).optional(),
    tax_amount: z.number().nonnegative().max(1_000_000).optional(),
    tax_rate: z.number().min(0).max(100).optional(),
    payment_method: z.string().max(50).optional(),
    card_last_four: z.string().regex(/^\d{4}$/).optional(),
    notes: z.string().max(500).optional(),
    confidence: z.number().min(0).max(1).optional(),
    not_a_receipt: z.boolean().optional(),
  })
  .passthrough();

export async function parseReceipt(input: ParseInput): Promise<ParseResult> {
  switch (input.kind) {
    case "email":
      return await parseEmail(input.raw);
    case "sms":
      return await parseSms(input.raw);
    case "paper":
      return await parsePaper(input.raw.ocrText);
  }
}

// ----------------------------------------------------------------------
// Email
// ----------------------------------------------------------------------

async function parseEmail(raw: EmailRaw): Promise<ParseResult> {
  // 1. Try template extractors first — cheap, no LLM call, deterministic.
  for (const template of EMAIL_TEMPLATES) {
    if (!template.match(raw)) continue;
    const fields = template.extract(raw);
    if (hasAllRequired(fields)) {
      return finalize(fields, TEMPLATE_HIT_CONFIDENCE);
    }
    // Partial template hit — feed what we have to the LLM as a hint so
    // the model fills the gaps without re-doing the merchant extraction.
    const llmResult = await tryLlm(
      "email",
      emailToText(raw),
      describeHint(fields, template.name)
    );
    return mergeAndFinalize(fields, llmResult, TEMPLATE_PARTIAL_CONFIDENCE);
  }

  // 2. No template matched — LLM-extract on the body.
  const llmResult = await tryLlm("email", emailToText(raw));
  return mergeAndFinalize({}, llmResult, 0);
}

function emailToText(raw: EmailRaw): string {
  const subject = raw.subject ? `Subject: ${raw.subject}\n\n` : "";
  if (raw.text && raw.text.length > 50) return subject + raw.text;
  if (raw.html) return subject + stripHtml(raw.html);
  return subject + (raw.text ?? "");
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ----------------------------------------------------------------------
// SMS
// ----------------------------------------------------------------------

async function parseSms(raw: SmsRaw): Promise<ParseResult> {
  for (const template of SMS_TEMPLATES) {
    if (!template.match(raw)) continue;
    const fields = template.extract(raw);
    if (hasAllRequired(fields)) {
      return finalize(fields, TEMPLATE_HIT_CONFIDENCE);
    }
    const llmResult = await tryLlm("sms", raw.body);
    return mergeAndFinalize(fields, llmResult, TEMPLATE_PARTIAL_CONFIDENCE);
  }

  const llmResult = await tryLlm("sms", raw.body);
  return mergeAndFinalize({}, llmResult, 0);
}

// ----------------------------------------------------------------------
// Paper
// ----------------------------------------------------------------------

async function parsePaper(ocrText: string): Promise<ParseResult> {
  if (!ocrText || ocrText.trim().length < 10) {
    return { status: "pending_review" };
  }
  const llmResult = await tryLlm("paper", ocrText);
  return mergeAndFinalize({}, llmResult, 0);
}

// ----------------------------------------------------------------------
// LLM call wrapper
// ----------------------------------------------------------------------

async function tryLlm(
  kind: LlmExtractKind,
  body: string,
  hint?: string
): Promise<LlmExtractResult | null> {
  if (!body || body.trim().length === 0) return null;
  // Trim very large inputs to keep token cost bounded. 16 KB is plenty
  // for any single receipt — Stripe's largest receipts are ~6 KB plain.
  const trimmed =
    body.length > 16_000 ? body.slice(0, 16_000) + "\n[…truncated]" : body;
  return await llmExtract(kind, trimmed, hint);
}

function describeHint(fields: PartialFields, templateName: string): string {
  const known: string[] = [];
  if (fields.merchant_name) known.push(`merchant=${fields.merchant_name}`);
  if (fields.total != null) known.push(`total=${fields.total}`);
  if (fields.currency) known.push(`currency=${fields.currency}`);
  if (fields.purchased_at) known.push(`purchased_at=${fields.purchased_at}`);
  return `Template "${templateName}" pre-extracted: ${known.join(", ") || "(nothing)"}. Verify and fill the rest.`;
}

// ----------------------------------------------------------------------
// Merge + validate + confidence-gate
// ----------------------------------------------------------------------

function mergeAndFinalize(
  templatePartial: PartialFields,
  llmRaw: LlmExtractResult | null,
  templateConfidence: number
): ParseResult {
  if (!llmRaw) {
    return hasAllRequired(templatePartial)
      ? finalize(
          templatePartial,
          templateConfidence || TEMPLATE_PARTIAL_CONFIDENCE
        )
      : { status: "pending_review" };
  }

  if (llmRaw.not_a_receipt) {
    return { status: "pending_review" };
  }

  const validated = LlmResultSchema.safeParse(llmRaw);
  const llm = validated.success ? validated.data : {};

  // Build the merged record. LLM provides defaults; template values
  // take precedence on the fields the template was confident about
  // (merchant, total, currency, purchased_at).
  const merged: PartialFields = {};
  if (llm.merchant) merged.merchant_name = llm.merchant;
  if (llm.amount != null) merged.total = llm.amount;
  if (llm.currency) merged.currency = llm.currency;
  if (llm.tax_amount != null) merged.tax_amount = llm.tax_amount;
  if (llm.tax_rate != null) merged.tax_rate = llm.tax_rate;
  if (llm.payment_method) merged.payment_method = llm.payment_method;
  if (llm.card_last_four) merged.card_last_four = llm.card_last_four;
  if (llm.notes) merged.notes = llm.notes;
  if (llm.receipt_date) {
    merged.purchased_at = `${llm.receipt_date}T${llm.receipt_time ?? "12:00"}:00.000Z`;
  }

  if (templatePartial.merchant_name) merged.merchant_name = templatePartial.merchant_name;
  if (templatePartial.total != null) merged.total = templatePartial.total;
  if (templatePartial.currency) merged.currency = templatePartial.currency;
  if (templatePartial.purchased_at) merged.purchased_at = templatePartial.purchased_at;

  if (templatePartial.tax_amount != null && merged.tax_amount == null)
    merged.tax_amount = templatePartial.tax_amount;
  if (templatePartial.tax_rate != null && merged.tax_rate == null)
    merged.tax_rate = templatePartial.tax_rate;
  if (templatePartial.payment_method && !merged.payment_method)
    merged.payment_method = templatePartial.payment_method;
  if (templatePartial.card_last_four && !merged.card_last_four)
    merged.card_last_four = templatePartial.card_last_four;
  if (templatePartial.notes && !merged.notes) merged.notes = templatePartial.notes;

  if (!hasAllRequired(merged)) {
    return { status: "pending_review" };
  }

  // Effective confidence: max of template confidence (when the template
  // matched any field) and the LLM self-report.
  const llmConfidence = typeof llm.confidence === "number" ? llm.confidence : 0;
  const confidence = Math.max(templateConfidence, llmConfidence);

  if (confidence < CONFIDENCE_FLOOR) {
    return { status: "pending_review" };
  }

  const category =
    llm.category && (CATEGORY_KEYS as readonly string[]).includes(llm.category)
      ? llm.category
      : null;

  return finalize(merged, confidence, category);
}

function finalize(
  fields: PartialFields,
  confidence: number,
  category: string | null = null
): ParseResult {
  if (!hasAllRequired(fields)) return { status: "pending_review" };
  const canonical: CanonicalReceiptFields = {
    merchant_name: fields.merchant_name as string,
    purchased_at: fields.purchased_at as string,
    total: fields.total as number,
    currency: fields.currency as string,
    subtotal: fields.subtotal ?? null,
    tax_amount: fields.tax_amount ?? null,
    tax_rate: fields.tax_rate ?? null,
    category,
    payment_method: fields.payment_method ?? null,
    card_last_four: fields.card_last_four ?? null,
    notes: fields.notes ?? null,
    parse_confidence: clamp01(confidence),
  };
  return { status: "ok", fields: canonical };
}

function hasAllRequired(fields: PartialFields): boolean {
  return (
    typeof fields.merchant_name === "string" &&
    fields.merchant_name.length > 0 &&
    typeof fields.total === "number" &&
    fields.total > 0 &&
    typeof fields.purchased_at === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(fields.purchased_at) &&
    typeof fields.currency === "string" &&
    (CURRENCY_OPTIONS as readonly string[]).includes(fields.currency)
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
