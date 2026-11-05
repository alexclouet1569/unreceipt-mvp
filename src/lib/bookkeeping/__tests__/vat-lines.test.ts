import { describe, expect, it } from "vitest";
import { inferRate, vatLinesConsistent, vatLinesFor } from "@/lib/bookkeeping/vat-lines";

describe("vatLinesFor", () => {
  it("uses the stored split when present, dropping malformed lines", () => {
    expect(
      vatLinesFor({
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

  it("derives one line from the single VAT fields, inferring the rate", () => {
    expect(vatLinesFor({ vat_lines: null, tax_amount: "25.00" as unknown as number, tax_rate: null, total: 125 })).toEqual([
      { rate: 25, net: 100, vat: 25, source: "tax_fields" },
    ]);
    expect(vatLinesFor({ vat_lines: [], tax_amount: 6, tax_rate: 12, total: 56 })).toEqual([
      { rate: 12, net: 50, vat: 6, source: "tax_fields" },
    ]);
  });

  it("gives a zero line when the receipt shows no VAT", () => {
    expect(vatLinesFor({ vat_lines: null, tax_amount: null, tax_rate: null, total: 80 })).toEqual([
      { rate: 0, net: 80, vat: 0, source: "none" },
    ]);
  });
});

describe("inferRate", () => {
  it("matches Swedish rates within rounding and gives 0 otherwise", () => {
    expect(inferRate(100, 25)).toBe(25);
    expect(inferRate(107.14, 12.86)).toBe(12);
    expect(inferRate(94.34, 5.66)).toBe(6);
    expect(inferRate(100, 19)).toBe(0);
    expect(inferRate(null, 5)).toBe(0);
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
