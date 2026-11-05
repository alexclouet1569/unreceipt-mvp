import { describe, expect, it } from "vitest";
import { OrgNumberSchema, VatLinesSchema, taxExceedsTotal, usableVatLines, vatFromGross } from "@/lib/receipts/receipt-fields";

describe("vatFromGross", () => {
  it("finds the VAT inside a VAT-inclusive total", () => {
    expect(vatFromGross(245, 25)).toBe(49);
    expect(vatFromGross(106, 6)).toBe(6);
    expect(vatFromGross(112, 12)).toBe(12);
    expect(vatFromGross(120, 20)).toBe(20);
  });

  it("rounds to cents", () => {
    expect(vatFromGross(99.9, 25)).toBe(19.98);
    expect(vatFromGross(10, 5.5)).toBe(0.52);
  });

  it("is zero at a zero rate", () => {
    expect(vatFromGross(500, 0)).toBe(0);
  });

  it("never exceeds the total it came from", () => {
    expect(taxExceedsTotal(vatFromGross(0.01, 25), 0.01)).toBe(false);
  });
});

describe("VAT lines and seller identifiers", () => {
  it("keeps well-formed VAT lines, drops the rest, caps at 10", () => {
    expect(
      usableVatLines([
        { rate: 25, net: 100, vat: 25 },
        { rate: 12, vat: 6 },
        { rate: "x", vat: 1 },
        { rate: 6, net: 10, vat: -1 },
      ])
    ).toEqual([
      { rate: 25, net: 100, vat: 25 },
      { rate: 12, net: null, vat: 6 },
    ]);
    expect(usableVatLines("nope")).toBeUndefined();
    expect(usableVatLines([{ rate: 101, vat: 1 }])).toBeUndefined();
    expect(usableVatLines(Array.from({ length: 12 }, (_, i) => ({ rate: i, vat: 1 })))).toHaveLength(10);
  });

  it("validates the schemas a person submits", () => {
    expect(VatLinesSchema.safeParse([{ rate: 25, net: null, vat: 25 }]).success).toBe(true);
    expect(VatLinesSchema.safeParse([{ rate: 25 }]).success).toBe(false);
    expect(OrgNumberSchema.safeParse(" 556677-8899 ").data).toBe("556677-8899");
    expect(OrgNumberSchema.safeParse("x".repeat(21)).success).toBe(false);
  });
});
