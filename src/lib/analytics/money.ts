// What a receipt adds to a total, and on which day. Pure.
//
// One rule for every number on the Insights screen and the home summary:
// - The day is the printed purchase day: receipt_date, else the date part
//   of purchased_at. purchased_at holds the receipt's own wall-clock time
//   written with a "Z" (parser.ts, capture), not a real UTC instant, so it
//   is never shifted into a time zone: a receipt printed at 23:15 on
//   31 December stays in December (and in its VAT period). A receipt
//   without a date is in no period: an upload day is not a purchase day.
// - The amount is in the company's currency: the receipt's own total when
//   it is in that currency, else its converted home_total (an ECB estimate
//   makes the sum "≈"). A foreign receipt not converted yet is kept apart,
//   never added in (DESIGN.md 2026-11-05).

import type { MoneyLine } from "@/lib/mobile/types";
import type { Receipt } from "@/lib/types";

export const ANALYTICS_TIME_ZONE = "Europe/Stockholm";

/** The receipt fields the analytics read. */
export type AnalyticsRow = Pick<
  Receipt,
  | "id"
  | "merchant_name"
  | "category"
  | "currency"
  | "total"
  | "home_total"
  | "home_currency"
  | "fx_rate"
  | "fx_source"
  | "fx_date"
  | "purchased_at"
  | "receipt_date"
  | "created_at"
  | "status"
  | "tax_amount"
  | "tax_rate"
  | "vat_lines"
  | "notes"
  | "bas_account"
  | "seller_org_number"
  | "merchant_vat_number"
>;

/** What the home summary needs (olderSummary): no text, no VAT. */
export const SUMMARY_COLUMNS =
  "id, category, currency, total, home_total, home_currency, fx_source, purchased_at, receipt_date, status";

// seller_org_number and merchant_vat_number are read for the invoice-
// validity rules still to come (förenklad faktura); unused for now.

export const ANALYTICS_COLUMNS =
  "id, merchant_name, category, currency, total, home_total, home_currency, fx_rate, fx_source, fx_date, " +
  "purchased_at, receipt_date, created_at, status, tax_amount, tax_rate, vat_lines, notes, bas_account, " +
  "seller_org_number, merchant_vat_number";

const dayFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ANALYTICS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of an instant in Europe/Stockholm. */
export function stockholmDay(instant: Date): string {
  const parts = dayFormat.formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The printed purchase day, or null when the receipt has no date. */
export function purchaseDay(r: Pick<Receipt, "purchased_at" | "receipt_date">): string | null {
  for (const v of [r.receipt_date, r.purchased_at]) {
    const d = v?.slice(0, 10);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return null;
}

export type Contribution =
  | { kind: "home"; amount: number; estimate: boolean }
  | { kind: "foreign"; amount: number; currency: string }
  | { kind: "none" };

/** What the receipt adds to a total in `home`. */
export function contribution(
  r: Pick<Receipt, "total" | "currency" | "home_total" | "home_currency" | "fx_source">,
  home: string
): Contribution {
  if (r.total == null || !Number.isFinite(Number(r.total))) return { kind: "none" };
  if (r.currency === home) return { kind: "home", amount: Number(r.total), estimate: false };
  if (r.home_total != null && r.home_currency === home) {
    return { kind: "home", amount: Number(r.home_total), estimate: r.fx_source === "ecb" };
  }
  return { kind: "foreign", amount: Number(r.total), currency: r.currency };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Adds receipts up into one total plus what couldn't be converted. */
export class Sum {
  amount = 0;
  estimate = false;
  count = 0;
  missingAmount = 0;
  private foreign = new Map<string, number>();

  add(c: Contribution): this {
    this.count += 1;
    if (c.kind === "home") {
      this.amount += c.amount;
      if (c.estimate) this.estimate = true;
    } else if (c.kind === "foreign") {
      this.foreign.set(c.currency, (this.foreign.get(c.currency) ?? 0) + c.amount);
    } else {
      this.missingAmount += 1;
    }
    return this;
  }

  get unconverted(): MoneyLine[] {
    return [...this.foreign]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: round2(amount), estimate: false }));
  }

  /** The company's currency first (always present), then the unconverted ones. */
  lines(home: string): MoneyLine[] {
    return [{ amount: round2(this.amount), currency: home, estimate: this.estimate }, ...this.unconverted];
  }
}
