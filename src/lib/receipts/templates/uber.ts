// Uber ride receipt email template. Uber emails carry totals in the
// subject ("Your Friday morning trip with Uber") and a structured body
// with "Total $X.XX" line.

import type { EmailTemplate, PartialFields } from "./types";
import {
  AMOUNT_PATTERN,
  CURRENCY_TOKEN,
  currencyAround,
  findDate,
  isFromDomain,
  parseAmount,
  stripHtml,
} from "./amount";

// A line starting "Total" / "Totalt" (optionally "inkl. moms"). Anchored to
// the line start so "Moms totalt 10,70 kr" isn't read as the total.
const TOTAL_RE = new RegExp(
  String.raw`^[ \t]*totalt?\b(?:[ \t]+inkl\.?[ \t]*moms)?[ \t]*[:.]?\s*(${CURRENCY_TOKEN})?[ \t\u00a0]*(${AMOUNT_PATTERN})[ \t\u00a0]*(${CURRENCY_TOKEN})?`,
  "im"
);
// Bounded so a body of repeated "from " can't make this quadratic.
const TRIP_DESCR_RE = /from\s+(.{1,200}?)\s+to\s+(.{1,200}?)(?:\.|$|\n)/i;
// Bounded: unbounded runs were quadratic on a body of dots (200 KB: 74 s).
const CARD_RE = /(?:•{2,8}|\.{2,8}|x{4,8}|\*{4,8})[ \t]{0,3}(\d{4})/i;

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
      const currency = currencyAround(totalMatch[1], totalMatch[3], text);
      if (currency) fields.currency = currency;
    }

    const iso = findDate(text) ?? findDate(raw.subject);
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
