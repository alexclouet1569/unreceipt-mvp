// Uber ride receipt email template. Uber emails carry totals in the
// subject ("Your Friday morning trip with Uber") and a structured body
// with "Total $X.XX" line.

import type { EmailTemplate, PartialFields } from "./types";
import {
  AMOUNT_PATTERN,
  currencyFromSymbol,
  isFromDomain,
  parseAmount,
  stripHtml,
} from "./amount";

// "Total" (English) or "Totalt" (Swedish).
const TOTAL_RE = new RegExp(
  String.raw`\btotalt?\b\s*[:.]?\s*([A-Z]{3}|\$|€|kr|SEK)?\s*(${AMOUNT_PATTERN})\s*([A-Z]{3}|\$|€|kr|SEK)?`,
  "i"
);
const MONTH_NAMES =
  "january|february|march|april|may|june|july|august|september|october|november|december";
// "15 October 2026" or "October 15, 2026".
const TRIP_DATE_RE = new RegExp(String.raw`(\d{1,2})\s+(${MONTH_NAMES})\s+(\d{4})`, "i");
const US_TRIP_DATE_RE = new RegExp(String.raw`\b(${MONTH_NAMES})\s+(\d{1,2}),?\s+(\d{4})`, "i");
// Bounded so a body of repeated "from " can't make this quadratic.
const TRIP_DESCR_RE = /from\s+(.{1,200}?)\s+to\s+(.{1,200}?)(?:\.|$|\n)/i;
const CARD_RE = /(?:•{2,}|\.{2,}|x{4,}|\*{4,})\s*(\d{4})/i;

export const uberTemplate: EmailTemplate = {
  name: "uber",
  trustedDomains: ["uber.com"],

  match(raw) {
    return (
      isFromDomain(raw.from, this.trustedDomains) ||
      // "Your trip with Uber", "Your Thursday evening trip with Uber"
      /your\s+(?:\w+\s+){0,2}trip\s+with\s+uber/i.test(raw.subject)
    );
  },

  extract(raw) {
    const text = stripHtml(raw.text ?? raw.html ?? "");
    const fields: PartialFields = {
      payment_method: "card",
    };

    const totalMatch = text.match(TOTAL_RE);
    if (totalMatch) {
      const amount = parseAmount(totalMatch[2]);
      if (amount != null) fields.total = amount;
      fields.currency = currencyFromSymbol(totalMatch[1] ?? totalMatch[3] ?? "");
    }

    const dateMatch = text.match(TRIP_DATE_RE) ?? raw.subject.match(TRIP_DATE_RE);
    const usDateMatch = dateMatch
      ? null
      : (text.match(US_TRIP_DATE_RE) ?? raw.subject.match(US_TRIP_DATE_RE));
    const iso = dateMatch
      ? toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3])
      : usDateMatch
        ? toIsoDate(usDateMatch[2], usDateMatch[1], usDateMatch[3])
        : null;
    if (iso) fields.purchased_at = `${iso}T12:00:00.000Z`;

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
