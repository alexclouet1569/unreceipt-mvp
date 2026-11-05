// VAT split per rate for a receipt, for the bookkeeping export. Pure.
//
// Receipts store either a full split (vat_lines, from extraction or the
// firm) or one VAT amount/rate (tax_amount, tax_rate), or nothing. The
// export wants one row per rate, so this derives the lines in that order of
// preference.

import type { Receipt, VatLine } from "@/lib/types";

export type DerivedVatLine = VatLine & {
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
  r: Pick<Receipt, "vat_lines" | "tax_amount" | "tax_rate" | "total">
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
    const rate = finite(r.tax_rate);
    const net = total != null ? round2(total - vat) : null;
    return [{ rate: rate ?? inferRate(net, vat), net, vat, source: "tax_fields" }];
  }

  return [{ rate: 0, net: total, vat: 0, source: "none" }];
}

/**
 * The Swedish rate that matches net and VAT, or 0 when none does (foreign
 * VAT, rounding beyond a few öre).
 */
export function inferRate(net: number | null, vat: number): number {
  if (net == null || net <= 0) return 0;
  const actual = (vat / net) * 100;
  for (const rate of [25, 12, 6]) {
    if (Math.abs(actual - rate) < 0.6) return rate;
  }
  return 0;
}

/** True when the split adds up to the receipt's single VAT amount (±0.05). */
export function vatLinesConsistent(
  lines: ReadonlyArray<Pick<VatLine, "vat">>,
  taxAmount: number | null | undefined
): boolean {
  if (taxAmount == null) return true;
  const sum = lines.reduce((acc, l) => acc + (Number(l.vat) || 0), 0);
  return Math.abs(sum - Number(taxAmount)) <= 0.05;
}
