// SERVER-ONLY. Claude-text LLM extractor for the intake parser fallback.
//
// Mirrors the structure of src/lib/ocr.ts (which is the image-input
// extractor used by /api/capture) but takes plain text — the body of
// a forwarded email, the body of an SMS, or the OCR'd text from a
// paper receipt. Same model, same JSON output, same env var.
//
// Used by src/lib/receipts/parser.ts as the fallback when no template
// matches.

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";

export type LlmExtractKind = "email" | "sms" | "paper";

export type LlmExtractResult = {
  merchant?: string;
  amount?: number;
  currency?: string;
  receipt_date?: string;
  receipt_time?: string;
  category?: string;
  tax_amount?: number;
  tax_rate?: number;
  payment_method?: string;
  card_last_four?: string;
  notes?: string;
  confidence?: number;
  not_a_receipt?: boolean;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  client = new Anthropic({ apiKey });
  return client;
}

export function _resetLlmExtractClientForTests(): void {
  client = null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export const SYSTEM_PROMPT = `You extract canonical receipt fields from text artifacts for UnReceipt, a Swedish SMB expense tool.

The input is one of:
  - email: a forwarded receipt from a vendor (Uber, Stripe, Amazon, SaaS, etc.). May be plain text or stripped HTML.
  - sms: a bank/card transaction confirmation (Swedbank, SEB, ICA Banken, Nordea, Handelsbanken). Usually one line.
  - paper: OCR'd text from a printed receipt photo. Noisy.

Return ONLY valid JSON matching this shape — no markdown, no prose, no code fences:

{
  "merchant": "<vendor/store name, e.g. ICA, Stripe, Pressbyrån>",
  "amount": <total paid, NUMBER not string>,
  "currency": "<one of: ${CURRENCY_OPTIONS.join(", ")}>",
  "receipt_date": "YYYY-MM-DD",
  "receipt_time": "HH:MM",
  "category": "<one of: ${CATEGORY_KEYS.join(", ")}>",
  "tax_amount": <VAT/MOMS number, or omit>,
  "tax_rate": <VAT percentage 0-100, or omit>,
  "payment_method": "<card | cash | klarna | swish | wire | apple_pay | google_pay, or omit>",
  "card_last_four": "<last 4 digits of card if mentioned, or omit>",
  "notes": "<one short line worth retaining, e.g. 'Trip from Hötorget to Arlanda', or omit>",
  "confidence": <0.0-1.0 — how confident overall in the extraction>
}

Rules:
- If you cannot determine a required field (merchant, amount, currency, date), set confidence below 0.5.
- If a field is unknown, OMIT it. Never invent. Never put null.
- amount is the FINAL TOTAL paid, not subtotal.
- currency: € → EUR, kr/SEK → SEK, $ → USD. Default SEK when ambiguous and the language looks Swedish; EUR otherwise.
- receipt_date: convert relative dates ("today", "yesterday", "i går") using Stockholm timezone.
- receipt_time: only include when explicitly stated.
- category: pick the closest match from the allowed list; default "other" when unclear.
- If the input is clearly NOT a receipt (newsletter, marketing email, conversation, ad), return ONLY: {"not_a_receipt": true}
- For SMS inputs, the bank pattern is often: "Köp <amount> SEK/kr hos <MERCHANT> <date>" — the merchant is BETWEEN "hos" and the date.`;

function userTurnFor(kind: LlmExtractKind, body: string, hint?: string): string {
  const banner = (() => {
    switch (kind) {
      case "email":
        return "Source: forwarded email";
      case "sms":
        return "Source: SMS / bank transaction confirmation";
      case "paper":
        return "Source: OCR text from a paper receipt photo (may be noisy)";
    }
  })();
  const today = `Today's date in Stockholm time is ${todayISO()} — use it for relative date inference.`;
  const hintLine = hint ? `\nHint: ${hint}\n` : "";
  return `${banner}\n${today}${hintLine}\n--- BEGIN INPUT ---\n${body}\n--- END INPUT ---\n\nExtract fields as JSON.`;
}

export async function llmExtract(
  kind: LlmExtractKind,
  body: string,
  hint?: string
): Promise<LlmExtractResult> {
  const c = getClient();
  const res = await c.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
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
        content: [{ type: "text", text: userTurnFor(kind, body, hint) }],
      },
    ],
  });

  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM returned no text content");
  }
  const cleaned = textBlock.text
    .trim()
    .replace(/^```(?:json)?\n?|\n?```$/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as LlmExtractResult;
  } catch {
    throw new Error(`LLM returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
}
