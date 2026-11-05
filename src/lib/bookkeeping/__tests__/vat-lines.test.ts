import { describe, expect, it } from "vitest";
import { inferSwedishRate, isSwedishRate, vatLinesConsistent, vatLinesFor } from "@/lib/bookkeeping/vat-lines";

const sek = { currency: "SEK" };

describe("vatLinesFor", () => {
  it("uses the stored split when present, dropping malformed lines", () => {
    expect(
      vatLinesFor({
        ...sek,
        vat_lines: [{ rate: 25, net: 100, vat: 25 }, { rate: 12, net: 50, vat: 6 }, { rate: null as unknown as number, net: 1, vat: 1 }],
        tax_amount: 31,
        tax_rate: null,
        total: 181,
      })
    ).toEqual([
      { rate: 25, net: 100, vat: 25, source: "vat_lines" },
      { rate: 12, net: 50, vat: 6, source: "vat_lines" },
    ]);
  });

  it("derives one line from the single VAT fields, inferring a Swedish rate for SEK only", () => {
    expect(vatLinesFor({ ...sek, vat_lines: null, tax_amount: "25.00" as unknown as number, tax_rate: null, total: 125 })).toEqual([
      { rate: 25, net: 100, vat: 25, source: "tax_fields" },
    ]);
    expect(vatLinesFor({ ...sek, vat_lines: [], tax_amount: 6, tax_rate: 12, total: 56 })).toEqual([
      { rate: 12, net: 50, vat: 6, source: "tax_fields" },
    ]);
    // Danish 25 % looks Swedish but is not: no inference outside SEK.
    expect(vatLinesFor({ currency: "EUR", vat_lines: null, tax_amount: 25, tax_rate: null, total: 125 })).toEqual([
      { rate: null, net: 100, vat: 25, source: "tax_fields" },
    ]);
    // A printed foreign rate is kept as printed.
    expect(vatLinesFor({ currency: "EUR", vat_lines: null, tax_amount: 19, tax_rate: 19, total: 119 })[0].rate).toBe(19);
  });

  it("gives a zero line when the receipt shows no VAT", () => {
    expect(vatLinesFor({ ...sek, vat_lines: null, tax_amount: null, tax_rate: null, total: 80 })).toEqual([
      { rate: 0, net: 80, vat: 0, source: "none" },
    ]);
  });
});

describe("inferSwedishRate", () => {
  it("matches Swedish rates within 0.3 pp and gives null otherwise", () => {
    expect(inferSwedishRate(100, 25)).toBe(25);
    expect(inferSwedishRate(100, 25.29)).toBe(25);
    expect(inferSwedishRate(100, 25.31)).toBeNull();
    expect(inferSwedishRate(107.14, 12.86)).toBe(12);
    expect(inferSwedishRate(94.34, 5.66)).toBe(6);
    // Finland's 25.5 % must not read as 25.
    expect(inferSwedishRate(100, 25.5)).toBeNull();
    expect(inferSwedishRate(100, 19)).toBeNull();
    expect(inferSwedishRate(null, 5)).toBeNull();
    expect(inferSwedishRate(100, 0)).toBeNull();
  });

  it("knows which rates are Swedish", () => {
    expect(isSwedishRate(25)).toBe(true);
    expect(isSwedishRate(19)).toBe(false);
    expect(isSwedishRate(null)).toBe(false);
  });
});

describe("vatLinesConsistent", () => {
  it("accepts a split that adds up to the single VAT amount", () => {
    expect(vatLinesConsistent([{ vat: 25 }, { vat: 6 }], 31)).toBe(true);
    expect(vatLinesConsistent([{ vat: 25 }, { vat: 6 }], 31.04)).toBe(true);
    expect(vatLinesConsistent([{ vat: 25 }], 31)).toBe(false);
    expect(vatLinesConsistent([{ vat: 25 }], null)).toBe(true);
  });
});
