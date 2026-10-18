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
  payment_method?: string;
  // Every line item visible on the receipt — what makes the digital
  // copy usable as proof of payment instead of just a summary.
  items?: OcrItem[];
  confidence?: number;
  not_a_receipt?: boolean;
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
  "tax_amount": <VAT/MOMS as a number, or omit if not visible>,
  "tax_rate": <VAT percentage as a number 0-100, or omit>,
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
- currency: infer from currency symbol (€=EUR, kr=SEK, $=USD), or default to SEK for Swedish-looking receipts.
- category: pick the closest match from the allowed list, default to "other" if unclear.
- items: extract EVERY line on the receipt — this is what turns the digital copy into a true replacement for the paper one (so the customer can use it as proof of payment for finance/VAT). For a supermarket receipt that means every product line (Red Bull, carrots, milk). For a restaurant receipt that's every dish + drink. Use the EXACT label as printed (preserve the original language). Omit "items" entirely when there's no itemized breakdown (single-line transfers, fuel-only receipts). Never invent items.
- Item total_amount is REQUIRED. qty and unit_amount are OPTIONAL — set to null when the receipt doesn't print them.`;

export async function extractReceipt(
  imageBase64: string,
  mediaType: OcrMediaType
): Promise<OcrResult> {
  const c = getClient();
  const res = await c.messages.create({
    // Chosen by the receipt OCR eval (evals/receipt-ocr, 2026-10-18):
    // matched Sonnet 5.5 and Opus 5.5 on total/date/currency at ~1/19th of
    // Sonnet 4.6's cost. At effort low it misread a UK dd/mm date.
    model: "claude-haiku-5-5",
    output_config: { effort: "medium" },
    // Haiku 5.5 thinks before answering, and thinking counts against
    // max_tokens: 4096 could cut the JSON off on a long receipt. The
    // eval's longest answer was ~2k tokens; much past 8k can't stream
    // back inside the routes' 30 s maxDuration anyway.
    max_tokens: 8000,
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

  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("OCR returned no text content");
  }
  const raw = textBlock.text.trim();
  const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as OcrResult;
  } catch {
    // Don't echo the model's output: it's receipt content (merchant,
    // address, card digits, email text) and this message reaches logs and
    // Sentry.
    throw new Error(`OCR returned non-JSON (${cleaned.length} chars)`);
  }
}
