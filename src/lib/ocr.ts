// SERVER-ONLY. Wraps the Claude vision call used by /api/ocr to pre-fill
// the capture form. Never import from a "use client" file — ANTHROPIC_API_KEY
// is not NEXT_PUBLIC_*, so a stray client import resolves env to undefined
// and getClient() throws fast rather than silently leaking the key.

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";

// Image MIME types Claude vision accepts directly + application/pdf, which
// goes through the SDK's `document` content block. PDFs are first-class
// because half the receipts a Swedish SMB sees are already digital (Stripe,
// Klarna, AWS, Apple invoices forwarded by hand).
export type OcrMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

export interface OcrResult {
  merchant?: string;
  amount?: number;
  currency?: string;
  receipt_date?: string;
  category?: string;
  notes?: string;
  tax_amount?: number;
  tax_rate?: number;
  // The seller's identifiers as printed (Swedish org.nr 556677-8899,
  // VAT/momsreg.nr SE556677889901) and the VAT split per rate when the
  // receipt shows more than one rate. Bookkeeping needs all three.
  seller_org_number?: string;
  seller_vat_number?: string;
  vat_lines?: OcrVatLine[];
  payment_method?: string;
  // Every line item visible on the receipt — what makes the digital
  // copy usable as proof of payment instead of just a summary.
  items?: OcrItem[];
  confidence?: number;
  not_a_receipt?: boolean;
}

export interface OcrVatLine {
  rate: number;
  net?: number | null;
  vat: number;
}

export interface OcrItem {
  label: string;
  qty?: number | null;
  unit_amount?: number | null;
  total_amount: number;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  client = new Anthropic({ apiKey });
  return client;
}

// Reset is exposed so unit tests can rebuild the client after stubbing env.
export function _resetOcrClientForTests(): void {
  client = null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export const SYSTEM_PROMPT = `You are a receipt OCR extractor for UnReceipt, a Swedish SMB expense tool.

Extract fields from the user's receipt image and return ONLY valid JSON matching this shape — no markdown, no prose, no code fences:

{
  "merchant": "<vendor/store name, e.g. ICA, Stripe, Pressbyrån>",
  "amount": <total paid, NUMBER not string, e.g. 49.50>,
  "currency": "<one of: ${CURRENCY_OPTIONS.join(", ")}>",
  "receipt_date": "YYYY-MM-DD",
  "category": "<one of: ${CATEGORY_KEYS.join(", ")}>",
  "tax_amount": <total VAT/MOMS as a number, or omit if not visible>,
  "tax_rate": <VAT percentage as a number 0-100 when the receipt has ONE rate, or omit>,
  "vat_lines": [ { "rate": <percent>, "net": <amount excl. VAT or null>, "vat": <VAT amount> } ],
  "seller_org_number": "<the seller's organisation number exactly as printed, e.g. 556677-8899 (Sweden: 'Org.nr', 'Orgnr'), or omit>",
  "seller_vat_number": "<the seller's VAT / momsreg.nr exactly as printed, e.g. SE556677889901, or omit>",
  "payment_method": "<e.g. card, cash, klarna, swish, or omit>",
  "items": [
    {
      "label": "<exact line label, preserve original language>",
      "qty": <number or null when not visible>,
      "unit_amount": <per-unit price or null>,
      "total_amount": <line total — REQUIRED>
    }
  ],
  "confidence": <0-1, how confident you are in the extraction overall>
}

Rules:
- If you cannot determine a field, OMIT it (do not guess and do not put null).
- If the image is not a receipt, return only: {"not_a_receipt": true}
- amount is the FINAL TOTAL paid, not subtotal.
- vat_lines: Swedish receipts often print a VAT table ("Moms 25% 100,00 25,00", "12%", "6%"). Give one entry per rate with the net and VAT amounts as printed; omit the array when only one total VAT figure is shown (use tax_amount/tax_rate then). The sum of vat_lines[].vat must equal tax_amount.
- seller_org_number / seller_vat_number: copy exactly as printed, never derive one from the other or invent one.
- currency: infer from currency symbol (€=EUR, kr=SEK, $=USD), or default to SEK for Swedish-looking receipts.
- category: pick the closest match from the allowed list, default to "other" if unclear.
- items: extract EVERY line on the receipt — this is what turns the digital copy into a true replacement for the paper one (so the customer can use it as proof of payment for finance/VAT). For a supermarket receipt that means every product line (Red Bull, carrots, milk). For a restaurant receipt that's every dish + drink. Use the EXACT label as printed (preserve the original language). Omit "items" entirely when there's no itemized breakdown (single-line transfers, fuel-only receipts). Never invent items.
- Item total_amount is REQUIRED. qty and unit_amount are OPTIONAL — set to null when the receipt doesn't print them.`;

// The production model and settings. The receipt OCR eval (evals/receipt-ocr)
// compares candidates against them before they change. 2026-11-07, 34
// synthetic cases: Sonnet 5.5 at effort low scored the same as Sonnet 4.6
// (97 %, same single miss) at p50 2.0 s instead of 4.5 s and a third of the
// cost. It thinks briefly before answering, so it needs more room than the
// answer itself (OCR_MAX_TOKENS below).
export const OCR_MODEL = "claude-sonnet-5-5";
export const OCR_EFFORT = "low";
// Its longest answer in the eval (a 25-line grocery receipt) was ~1,100
// output tokens; 8000 leaves room for thinking and ~100 item lines while
// capping a runaway answer at about $0.08.
export const OCR_MAX_TOKENS = 8000;

// Eval-only knobs; the routes call extractReceipt() without them. Never fill
// these from a request: they decide what each call costs.
export interface OcrOptions {
  model?: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export interface OcrCall {
  result: OcrResult;
  model: string;
  usage: Anthropic.Usage;
  stopReason: Anthropic.StopReason | null;
}

// The call was billed but its output couldn't be used. Carries the call's
// model and usage so the eval still counts what it cost.
export class OcrOutputError extends Error {
  constructor(
    message: string,
    readonly call: Omit<OcrCall, "result">
  ) {
    super(message);
    this.name = "OcrOutputError";
  }
}

export async function extractReceipt(
  imageBase64: string,
  mediaType: OcrMediaType
): Promise<OcrResult> {
  return (await extractReceiptCall(imageBase64, mediaType)).result;
}

export async function extractReceiptCall(
  imageBase64: string,
  mediaType: OcrMediaType,
  options: OcrOptions = {}
): Promise<OcrCall> {
  const c = getClient();
  const res = await c.messages.create({
    model: options.model ?? OCR_MODEL,
    // A long supermarket receipt (~30 item lines) plus the model's thinking
    // needs several thousand tokens; a cut-off answer breaks JSON.parse.
    max_tokens: options.maxTokens ?? OCR_MAX_TOKENS,
    output_config: { effort: options.effort ?? OCR_EFFORT },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          mediaType === "application/pdf"
            ? {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: imageBase64,
                },
              }
            : {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
          {
            type: "text",
            text: `Extract fields as JSON. Today's date in Stockholm time is ${todayISO()} — use it for relative date inference when the receipt date is implicit.`,
          },
        ],
      },
    ],
  });
  const call = { model: res.model, usage: res.usage, stopReason: res.stop_reason };

  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new OcrOutputError("OCR returned no text content", call);
  }
  const raw = textBlock.text.trim();
  // A cut-off answer is never used, even if an object can be found in it.
  if (res.stop_reason === "max_tokens") {
    throw new OcrOutputError(`OCR answer cut off at max_tokens (${raw.length} chars)`, call);
  }
  const result = parseOcrJson(raw);
  if (result) return { ...call, result };
  // Don't echo the model's output: it's receipt content (merchant, address,
  // card digits, email text) and this message reaches logs and Sentry.
  throw new OcrOutputError(`OCR returned non-JSON (${raw.length} chars)`, call);
}

// Top-level keys of an answer; an object without any of them (an item
// line, a VAT line) is not the answer.
const RESULT_KEYS = ["merchant", "amount", "currency", "receipt_date", "not_a_receipt", "items", "tax_amount"];

function asResult(value: unknown): OcrResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return RESULT_KEYS.some((k) => k in value) ? (value as OcrResult) : null;
}

/** The index of the `}` that closes the `{` at `start`, or -1. */
function closingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * The answer object in the model's reply. Usually the whole reply; on a hard
 * photo (upside down) the model sometimes writes a sentence or its working
 * first, or wraps the JSON in a code fence. The FIRST complete object with
 * answer keys wins, so an object quoted after the answer (text printed on
 * the receipt) can't replace it. Returns null when there is none.
 */
export function parseOcrJson(text: string): OcrResult | null {
  const cleaned = text.replace(/^```(?:json)?\n?|\n?```$/g, "").trim();
  try {
    const whole = JSON.parse(cleaned);
    if (whole && typeof whole === "object" && !Array.isArray(whole)) return whole as OcrResult;
  } catch {
    // Fall through: look for the object inside the text.
  }
  for (let start = cleaned.indexOf("{"); start !== -1; start = cleaned.indexOf("{", start + 1)) {
    const end = closingBrace(cleaned, start);
    if (end === -1) continue;
    try {
      const found = asResult(JSON.parse(cleaned.slice(start, end + 1)));
      if (found) return found;
    } catch {
      // Not valid JSON from here; try the next brace.
    }
  }
  return null;
}
