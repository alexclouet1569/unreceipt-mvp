import { describe, expect, it } from "vitest";
import { pickVatDetails, taxExceedsTotal, vatFromGross } from "@/lib/receipts/receipt-fields";

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

describe("pickVatDetails", () => {
  it("keeps every valid field and drops the invalid ones", () => {
    expect(
      pickVatDetails({
        merchant_vat_number: " SE556677889901 ",
        merchant_org_number: "x".repeat(41),
        buyer_name: "Acme AB",
        buyer_address: "",
        vat_breakdown: [{ rate: 6, vat_amount: 10.2 }, { rate: 25, vat_amount: 4 }],
        merchant: "ICA",
      }),
    ).toEqual({
      merchant_vat_number: "SE556677889901",
      buyer_name: "Acme AB",
      vat_breakdown: [{ rate: 6, vat_amount: 10.2 }, { rate: 25, vat_amount: 4 }],
    });
  });

  it("drops a malformed breakdown and handles non-objects", () => {
    expect(pickVatDetails({ vat_breakdown: [{ rate: 600, vat_amount: 1 }] })).toEqual({});
    expect(pickVatDetails(null)).toEqual({});
    expect(pickVatDetails("SE1")).toEqual({});
  });
});
