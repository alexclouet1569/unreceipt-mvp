import { describe, expect, it } from "vitest";
import { checkSwedishVat, vatNumberCountry, type VatCheckInput } from "../se-vat-check";
import { SE_VAT_RULES } from "../se-vat-rules";

// Synthetic fixtures modelled on common Swedish receipts. They test the
// rules, not the reader: the OCR accuracy benchmark on real receipts is
// launch plan action 111.
const receipt = (overrides: Partial<VatCheckInput> = {}): VatCheckInput => ({
  total: 342,
  currency: "SEK",
  tax_amount: 19.36,
  tax_rate: 6,
  merchant_vat_number: null,
  merchant_org_number: "556677-8899",
  buyer_name: null,
  buyer_address: null,
  ...overrides,
});

const ids = (r: VatCheckInput) => {
  const result = checkSwedishVat(r);
  return result.applies ? result.findings.map((f) => f.id) : null;
};

describe("checkSwedishVat — simplified invoice (up to 4,000 kr)", () => {
  it("passes a grocery receipt with an org.nr and the VAT shown", () => {
    expect(ids(receipt())).toEqual([]);
  });

  it("accepts a VAT number instead of an org.nr", () => {
    expect(ids(receipt({ merchant_org_number: null, merchant_vat_number: "SE556677889901" }))).toEqual([]);
  });

  it("accepts a VAT rate without the amount (enough to work the VAT out)", () => {
    expect(ids(receipt({ tax_amount: null, tax_rate: 25 }))).toEqual([]);
  });

  it("accepts a VAT breakdown with several rates", () => {
    expect(
      ids(receipt({ tax_amount: null, tax_rate: null, vat_breakdown: [{ rate: 6, vat_amount: 10 }, { rate: 25, vat_amount: 20 }] })),
    ).toEqual([]);
  });

  it("warns when the seller isn't identified", () => {
    const result = checkSwedishVat(receipt({ merchant_org_number: null }));
    expect(result.applies && result.findings[0].id).toBe("simplified_invoice_incomplete");
    expect(result.applies && result.findings[0].detail).toContain("VAT or organisation number");
    expect(result.applies && result.findings[0].detail).not.toContain("VAT amount");
  });

  it("warns when no VAT is shown, naming both gaps when both are missing", () => {
    const result = checkSwedishVat(receipt({ merchant_org_number: null, tax_amount: null, tax_rate: null }));
    expect(result.applies && result.findings[0].detail).toContain(
      "the seller’s VAT or organisation number and the VAT amount or rate",
    );
  });

  it("treats exactly 4,000 kr as a simplified invoice", () => {
    expect(ids(receipt({ total: SE_VAT_RULES.simplifiedInvoiceMaxSek }))).toEqual([]);
  });
});

describe("checkSwedishVat — above 4,000 kr", () => {
  const big = { total: 4000.01, tax_amount: 800, tax_rate: 25 };

  it("asks for a full invoice when a till receipt lacks the buyer", () => {
    const result = checkSwedishVat(receipt({ ...big, merchant_vat_number: "SE556677889901" }));
    expect(result.applies && result.findings.map((f) => f.id)).toEqual(["full_invoice_needed"]);
    expect(result.applies && result.findings[0].detail).toContain("your company’s name and your company’s address");
  });

  it("needs the seller's VAT number, an org.nr isn't enough", () => {
    const result = checkSwedishVat(
      receipt({ ...big, buyer_name: "Acme AB", buyer_address: "Storgatan 1, Stockholm" }),
    );
    expect(result.applies && result.findings[0].detail).toContain("the seller’s VAT number");
  });

  it("passes a full invoice", () => {
    expect(
      ids(
        receipt({
          ...big,
          merchant_vat_number: "SE556677889901",
          buyer_name: "Acme AB",
          buyer_address: "Storgatan 1, Stockholm",
        }),
      ),
    ).toEqual([]);
  });
});

describe("checkSwedishVat — foreign VAT and other cases", () => {
  it("flags VAT from a seller with another EU VAT number", () => {
    const result = checkSwedishVat(receipt({ merchant_vat_number: "FR40303265045", currency: "EUR", total: 89 }));
    expect(result.applies && result.findings.map((f) => [f.id, f.title])).toEqual([["foreign_vat", "Foreign VAT"]]);
  });

  it("flags VAT charged in another currency as probably foreign", () => {
    const result = checkSwedishVat(receipt({ merchant_org_number: null, currency: "EUR", total: 18.5, tax_amount: 1.68, tax_rate: 10 }));
    expect(result.applies && result.findings[0].title).toBe("Probably foreign VAT");
  });

  it("doesn't apply when no VAT was charged", () => {
    expect(checkSwedishVat(receipt({ tax_amount: 0, tax_rate: 0 }))).toEqual({ applies: false });
  });

  it("doesn't apply to a Swedish seller's receipt in another currency (no exchange rate)", () => {
    expect(checkSwedishVat(receipt({ currency: "EUR", merchant_vat_number: "SE556677889901" }))).toEqual({ applies: false });
  });

  it("notes a rate that isn't Swedish", () => {
    expect(ids(receipt({ tax_rate: 20 }))).toEqual(["unusual_rate"]);
    expect(ids(receipt({ tax_rate: 12 }))).toEqual([]);
  });
});

describe("vatNumberCountry", () => {
  it("reads EU prefixes and ignores everything else", () => {
    expect(vatNumberCountry("SE 5566 7788 9901")).toBe("SE");
    expect(vatNumberCountry("EL123456789")).toBe("EL");
    expect(vatNumberCountry("556677-8899")).toBeNull();
    expect(vatNumberCountry("US123456789")).toBeNull();
    expect(vatNumberCountry(null)).toBeNull();
  });
});
