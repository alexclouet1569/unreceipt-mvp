// Swedish bank transaction-confirmation SMS templates. The dominant
// patterns across Swedbank / SEB / ICA Banken / Nordea / Handelsbanken
// all look like:
//
//   "Köp 194,00 kr hos ICA MAXI STOCKHOLM 2026-05-10 14:32"
//   "Kortköp 49,00 SEK hos PRESSBYRÅN T-CENTRAL 2026-05-10"
//   "Inköp SEK 25.00 hos ESPRESSO HOUSE 10/05-26"
//
// We match the common shape rather than per-bank — the wording varies
// less than expected. Bank-specific quirks (delivery-fee separator,
// instalments) can land as discrete templates later.

import type { PartialFields, SmsTemplate } from "./types";

// Anchored, case-insensitive, multi-format. Groups:
//   1: amount (with , or . decimal)
//   2: currency symbol/code (optional, may be SEK | kr | €)
//   3: merchant
//   4: date (YYYY-MM-DD or DD/MM-YY)
//   5: time (HH:MM, optional)
const SHAPE_RE =
  /(?:k(?:ö|o)p|inköp|kortköp|kort-?köp|köpt)\s+(?:(SEK|kr|€)\s*)?([\d.,]+)\s*(?:(SEK|kr|€)\s+)?(?:hos|vid|på|at)\s+(.+?)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}[-/]\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/i;

export const swedishBankSmsTemplate: SmsTemplate = {
  name: "swedish-bank-sms",

  match(raw) {
    return SHAPE_RE.test(raw.body);
  },

  extract(raw) {
    const m = raw.body.match(SHAPE_RE);
    if (!m) return {};

    const symBefore = m[1];
    const amountRaw = m[2];
    const symAfter = m[3];
    const merchant = m[4].trim();
    const dateRaw = m[5];
    const timeRaw = m[6];

    const fields: PartialFields = {
      merchant_name: merchant,
      payment_method: "card",
      currency: currencyFor(symBefore ?? symAfter) ?? "SEK",
    };

    const amount = parseAmount(amountRaw);
    if (amount != null) fields.total = amount;

    const iso = parseDate(dateRaw, timeRaw);
    if (iso) fields.purchased_at = iso;

    return fields;
  },
};

function parseAmount(raw: string): number | null {
  // 194,00 → 194.00 ; 1.234,50 → 1234.50 ; 25.00 → 25.00
  let cleaned = raw;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Continental "1.234,50" — drop thousand separators, swap decimal.
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function currencyFor(sym?: string): string | undefined {
  if (!sym) return undefined;
  const s = sym.toLowerCase();
  if (s === "sek" || s === "kr") return "SEK";
  if (s === "€" || s === "eur") return "EUR";
  return undefined;
}

function parseDate(date: string, time: string | undefined): string | null {
  // ISO: 2026-05-10
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${time ?? "12:00"}:00.000Z`;

  // DD/MM-YY or DD/MM/YY
  const swedish = /^(\d{1,2})\/(\d{1,2})[-/](\d{2,4})$/.exec(date);
  if (swedish) {
    const dd = swedish[1].padStart(2, "0");
    const mm = swedish[2].padStart(2, "0");
    let yy = swedish[3];
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm}-${dd}T${time ?? "12:00"}:00.000Z`;
  }

  return null;
}
