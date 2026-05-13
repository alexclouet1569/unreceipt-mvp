// Stripe receipt email template — matches both Stripe's own platform
// receipts and merchant receipts sent via Stripe (subject typically
// "Your receipt from <Brand> [#1234-5678]"). DKIM-verified senders end
// in stripe.com.

import type { EmailTemplate, PartialFields } from "./types";

const SUBJECT_RE = /receipt from\s+(.+?)(?:\s+\[#?[A-Z0-9-]+\])?$/i;
const AMOUNT_LINE_RE =
  /(?:amount\s+paid|total)\s*[:\s]\s*([A-Z]{3}|\$|€|kr|SEK)?\s*([\d.,]+)\s*([A-Z]{3}|\$|€|kr|SEK)?/i;
const DATE_RE =
  /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i;
const CARD_RE = /(?:•{2,}|\.{2,}|x{4,}|\*{4,})\s*(\d{4})/;

export const stripeTemplate: EmailTemplate = {
  name: "stripe",

  match(raw) {
    const from = raw.from.toLowerCase();
    if (from.includes("@stripe.com") || from.includes("@receipts.stripe.com")) {
      return true;
    }
    // Defensive: merchants can configure their own from-address. Fall
    // back to subject heuristic + body fingerprint.
    if (/receipt from\b/i.test(raw.subject)) {
      const body = (raw.text ?? raw.html ?? "").toLowerCase();
      return body.includes("powered by stripe") || body.includes("stripe.com");
    }
    return false;
  },

  extract(raw) {
    const text = stripHtml(raw.text ?? raw.html ?? "");
    const fields: PartialFields = { currency: "USD" };

    const subjectMerchant = raw.subject.match(SUBJECT_RE);
    if (subjectMerchant) {
      fields.merchant_name = subjectMerchant[1].trim();
    }

    const amountMatch = text.match(AMOUNT_LINE_RE);
    if (amountMatch) {
      const sym = (amountMatch[1] ?? amountMatch[3] ?? "").toLowerCase();
      const amount = parseAmount(amountMatch[2]);
      if (amount != null) fields.total = amount;
      fields.currency = currencyFromSymbol(sym) ?? fields.currency;
    }

    const dateMatch = text.match(DATE_RE);
    if (dateMatch) {
      const iso = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (iso) fields.purchased_at = `${iso}T12:00:00.000Z`;
    }

    const cardMatch = text.match(CARD_RE);
    if (cardMatch) {
      fields.card_last_four = cardMatch[1];
      fields.payment_method = "card";
    }

    return fields;
  },
};

function stripHtml(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(raw: string): number | null {
  // Handle both "1,234.56" (US) and "1.234,56" (EU) and "194,00" (kr).
  const cleaned = raw.includes(",") && !raw.includes(".")
    ? raw.replace(",", ".")
    : raw.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function currencyFromSymbol(sym: string): string | undefined {
  if (sym === "$") return "USD";
  if (sym === "€") return "EUR";
  if (sym === "kr" || sym === "sek") return "SEK";
  if (/^[a-z]{3}$/i.test(sym)) return sym.toUpperCase();
  return undefined;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toIsoDate(d: string, m: string, y: string): string | null {
  const mm = MONTHS[m.toLowerCase().slice(0, 3)];
  if (!mm) return null;
  const dd = d.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
