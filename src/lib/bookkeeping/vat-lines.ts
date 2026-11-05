// VAT split per rate for a receipt, for the bookkeeping export. Pure.
//
// Receipts store either a full split (vat_lines, from extraction or the
// firm) or one VAT amount/rate (tax_amount, tax_rate), or nothing. The
// export wants one row per rate, so this derives the lines in that order of
// preference. A rate is only ever inferred for a SEK receipt and only when
// net and VAT fit a Swedish rate; otherwise the rate stays unknown (null)
// and the cell is blank, so the accountant can't mistake a guess for a
// printed value.

import type { Receipt, VatLine } from "@/lib/types";
import { INPUT_VAT_CURRENCY, SWEDISH_VAT_RATES, VAT_RATE_TOLERANCE_PP, VAT_SPLIT_TOLERANCE } from "./rules";

export type DerivedVatLine = {
  // Null when the receipt printed a VAT amount but no rate could be read.
  rate: number | null;
  net: number | null;
  vat: number;
  // Where the line came from: a stored split, the single VAT fields, or a
  // placeholder when the receipt shows no VAT at all.
  source: "vat_lines" | "tax_fields" | "none";
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function vatLinesFor(
  r: Pick<Receipt, "vat_lines" | "tax_amount" | "tax_rate" | "total" | "currency">
): DerivedVatLine[] {
  if (Array.isArray(r.vat_lines) && r.vat_lines.length > 0) {
    const lines = r.vat_lines
      .map((l) => ({
        rate: finite(l?.rate),
        net: finite(l?.net),
        vat: finite(l?.vat),
      }))
      .filter((l): l is { rate: number; net: number | null; vat: number } =>
        l.rate != null && l.vat != null
      )
      .map((l) => ({ ...l, source: "vat_lines" as const }));
    if (lines.length > 0) return lines;
  }

  const vat = finite(r.tax_amount);
  const total = finite(r.total);
  if (vat != null) {
    const printed = finite(r.tax_rate);
    const net = total != null ? round2(total - vat) : null;
    const rate = printed ?? (r.currency === INPUT_VAT_CURRENCY ? inferSwedishRate(net, vat) : null);
    return [{ rate, net, vat, source: "tax_fields" }];
  }

  return [{ rate: 0, net: total, vat: 0, source: "none" }];
}

/**
 * The Swedish rate that net and VAT fit within VAT_RATE_TOLERANCE_PP, or
 * null when none does (foreign VAT, odd rounding). Only meaningful for a
 * SEK receipt; the caller checks the currency.
 */
export function inferSwedishRate(net: number | null, vat: number): number | null {
  if (net == null || net <= 0 || vat <= 0) return null;
  const actual = (vat / net) * 100;
  for (const rate of SWEDISH_VAT_RATES) {
    if (Math.abs(actual - rate) < VAT_RATE_TOLERANCE_PP) return rate;
  }
  return null;
}

/** True when `rate` is a Swedish VAT rate. */
export function isSwedishRate(rate: number | null): boolean {
  return rate != null && (SWEDISH_VAT_RATES as readonly number[]).includes(rate);
}

/** True when the split adds up to the receipt's single VAT amount. */
export function vatLinesConsistent(
  lines: ReadonlyArray<Pick<VatLine, "vat">>,
  taxAmount: number | null | undefined
): boolean {
  if (taxAmount == null) return true;
  const sum = lines.reduce((acc, l) => acc + (Number(l.vat) || 0), 0);
  return Math.abs(sum - Number(taxAmount)) <= VAT_SPLIT_TOLERANCE;
}
