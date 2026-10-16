import { describe, expect, it } from "vitest";
import { taxExceedsTotal, vatFromGross } from "@/lib/receipts/receipt-fields";

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
