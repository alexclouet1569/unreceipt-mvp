// Amounts and dates in the app's language. Pure (Intl only), so it's tested
// in Node; Hermes on iOS has the same Intl.

import type { Locale } from "../i18n/core";

const SYMBOLS: Record<string, string> = { SEK: "kr", EUR: "€", USD: "$", GBP: "£", NOK: "kr", DKK: "kr" };

const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" };

export type MoneyParts = {
  /** "245.00", "1 305,00" (with the language's own separators). */
  value: string;
  /** A symbol or code before the value ("€" in English), or "". */
  prefix: string;
  /** A symbol or code after the value ("kr", "€" in Swedish and French), or "". */
  suffix: string;
};

/**
 * Split like the website's inbox card (DESIGN.md: the currency is set
 * smaller than the number). Letters ("kr", "CHF") always follow the number.
 * A glyph leads in English ("€12.50") and follows in Swedish and French
 * ("12,50 €"), as people write it there.
 */
export function moneyParts(amount: number, currency: string, locale: Locale): MoneyParts {
  const value = new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const symbol = SYMBOLS[currency] ?? currency;
  const glyph = symbol.length === 1;
  if (glyph && locale === "en") return { value, prefix: symbol, suffix: "" };
  return { value, prefix: "", suffix: symbol };
}

/** One string: "245.00 kr", "€12.50", "12,50 €". */
export function formatMoney(amount: number, currency: string, locale: Locale): string {
  const p = moneyParts(amount, currency, locale);
  return p.prefix ? `${p.prefix}${p.value}` : `${p.value} ${p.suffix}`;
}

/**
 * A receipt's date as a local calendar day. A plain "2026-11-08"
 * (receipt_date) is that day wherever the phone is; `new Date()` would read
 * it as UTC midnight and show the day before west of Greenwich.
 */
export function parseReceiptDate(value: string | null): Date | null {
  if (!value) return null;
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export type DayGroup =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "thisWeek" }
  | { kind: "month"; year: number; month: number }
  | { kind: "noDate" };

/** Which list section a date belongs to. `now` is a parameter for tests. */
export function dayGroup(date: Date | null, now: Date = new Date()): DayGroup {
  if (!date) return { kind: "noDate" };
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return { kind: "today" };
  if (days === 1) return { kind: "yesterday" };
  if (days < 7) return { kind: "thisWeek" };
  return { kind: "month", year: date.getFullYear(), month: date.getMonth() };
}

/** "November", or "November 2025" for another year; capitalised in every language. */
export function monthLabel(year: number, month: number, locale: Locale, now: Date = new Date()): string {
  const d = new Date(year, month, 1);
  const options: Intl.DateTimeFormatOptions =
    year === now.getFullYear() ? { month: "long" } : { month: "long", year: "numeric" };
  const label = new Intl.DateTimeFormat(INTL_LOCALE[locale], options).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "8 Nov" / "8 nov." — the short date on a receipt row. */
export function shortDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "short" }).format(date);
}

/** "Saturday 8 November 2026" — the receipt detail. */
export function longDate(date: Date, locale: Locale): string {
  const label = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
