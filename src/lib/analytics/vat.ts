// The VAT block of the Insights screen. Pure. What the receipts say, never
// a VAT return and never a claim of what can be deducted: that depends on
// the company's VAT registration (a small business exempt from VAT
// deducts nothing) and on what each purchase was for (a private lunch, a
// car, staff parties), which the receipt alone can't tell. The accountant
// decides; the screen says so next to the numbers.
//
// - Only receipts in the company's currency count: VAT on receipts in
//   another currency is not counted.
// - A Swedish company in kronor ("se") gets the VAT at Swedish rates on
//   confirmed receipts, client entertainment (representation, whose
//   deduction is limited) apart, and what needs a look first: unconfirmed
//   receipts and lines whose rate isn't Swedish or couldn't be read.
// - Any other company: the VAT as printed only.

import { INPUT_VAT_CURRENCY } from "@/lib/bookkeeping/rules";
import { isSwedishRate, vatLinesFor } from "@/lib/bookkeeping/vat-lines";
import type { AnalyticsVat } from "@/lib/mobile/types";
import { round2, type AnalyticsRow } from "./money";

/** The VAT block applies Swedish rate rules only to a Swedish company in kronor. */
export function isSwedishVat(country: string, home: string): boolean {
  return country === "SE" && home === INPUT_VAT_CURRENCY;
}

export function vatFor(rows: AnalyticsRow[], home: string, country: string): AnalyticsVat {
  const se = isSwedishVat(country, home);
  const byRate = new Map<string, { rate: number | null; net: number; netKnown: boolean; vat: number }>();
  let total = 0;
  let swedish = 0;
  let representation = 0;
  let toCheck = 0;
  const toCheckIds = new Set<string>();
  let withoutVat = 0;
  let foreign = 0;

  for (const r of rows) {
    if (r.total == null && r.tax_amount == null && !r.vat_lines?.length) continue;
    if (r.currency !== home) {
      foreign += 1;
      continue;
    }
    const lines = vatLinesFor(r);
    if (lines.length === 1 && lines[0].source === "none") {
      withoutVat += 1;
      continue;
    }
    for (const l of lines) {
      const key = l.rate == null ? "?" : String(l.rate);
      const acc = byRate.get(key) ?? { rate: l.rate, net: 0, netKnown: false, vat: 0 };
      acc.vat += l.vat;
      if (l.net != null) {
        acc.net += l.net;
        acc.netKnown = true;
      }
      byRate.set(key, acc);
      total += l.vat;
      if (!se) continue;
      if (r.status !== "verified" || !isSwedishRate(l.rate)) {
        toCheck += l.vat;
        toCheckIds.add(r.id);
      } else if (r.category === "client_entertainment") {
        representation += l.vat;
      } else {
        swedish += l.vat;
      }
    }
  }

  const rates = [...byRate.values()]
    .sort((a, b) => (a.rate == null ? 1 : b.rate == null ? -1 : b.rate - a.rate))
    .map((r) => ({ rate: r.rate, net: r.netKnown ? round2(r.net) : null, vat: round2(r.vat) }));

  return {
    mode: se ? "se" : "other",
    total: round2(total),
    rates,
    swedish: se ? round2(swedish) : null,
    representation: se ? round2(representation) : null,
    toCheck: se ? { amount: round2(toCheck), count: toCheckIds.size } : null,
    withoutVat,
    foreign,
  };
}
