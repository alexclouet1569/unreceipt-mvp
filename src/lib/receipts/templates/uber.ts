// Uber ride receipt email template. Uber emails carry totals in the
// subject ("Your Friday morning trip with Uber") and a structured body
// with "Total $X.XX" line.

import type { EmailTemplate, PartialFields } from "./types";

const TOTAL_RE =
  /\btotal\b\s*[:.]?\s*([A-Z]{3}|\$|€|kr|SEK)?\s*([\d.,]+)\s*([A-Z]{3}|\$|€|kr|SEK)?/i;
const TRIP_DATE_RE =
  /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i;
const TRIP_DESCR_RE = /from\s+(.+?)\s+to\s+(.+?)(?:\.|$|\n)/i;
const CARD_RE = /(?:•{2,}|\.{2,}|x{4,}|\*{4,})\s*(\d{4})/i;

export const uberTemplate: EmailTemplate = {
  name: "uber",

  match(raw) {
    const from = raw.from.toLowerCase();
    return (
      from.includes("@uber.com") ||
      from.includes("noreply@uber") ||
      from.includes("receipts@uber") ||
      /your\s+(?:\w+\s+)?trip\s+with\s+uber/i.test(raw.subject)
    );
  },

  extract(raw) {
    const text = stripHtml(raw.text ?? raw.html ?? "");
    const fields: PartialFields = {
      payment_method: "card",
    };

    const totalMatch = text.match(TOTAL_RE);
    if (totalMatch) {
      const sym = (totalMatch[1] ?? totalMatch[3] ?? "").toLowerCase();
      const amount = parseAmount(totalMatch[2]);
      if (amount != null) fields.total = amount;
      fields.currency = currencyFromSymbol(sym);
    }

    const dateMatch = text.match(TRIP_DATE_RE) ?? raw.subject.match(TRIP_DATE_RE);
    if (dateMatch) {
      const iso = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (iso) fields.purchased_at = `${iso}T12:00:00.000Z`;
    }

    fields.merchant_name = "Uber";

    const tripMatch = text.match(TRIP_DESCR_RE);
    if (tripMatch) {
      fields.notes = `Trip from ${tripMatch[1].trim()} to ${tripMatch[2].trim()}`;
    }

    const cardMatch = text.match(CARD_RE);
    if (cardMatch) fields.card_last_four = cardMatch[1];

    return fields;
  },
};

function stripHtml(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(raw: string): number | null {
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
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

function toIsoDate(d: string, m: string, y: string): string | null {
  const mm = MONTHS[m.toLowerCase()];
  if (!mm) return null;
  const dd = d.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
