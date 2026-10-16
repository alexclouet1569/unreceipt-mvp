import { describe, expect, it } from "vitest";
import {
  checkSwedishVat,
  vatCheckSummary,
  vatNumberCountry,
  type VatCheckInput,
} from "../se-vat-check";
import { SE_VAT_RULES } from "../se-vat-rules";

// Synthetic fixtures modelled on common Swedish receipts. They test the
// rules, not the reader: the benchmark on real receipts is launch plan
// actions 69 and 111.
const receipt = (overrides: Partial<VatCheckInput> = {}): VatCheckInput => ({
  total: 342,
  currency: "SEK",
  tax_amount: 19.36,
  tax_rate: 6,
  merchant_vat_number: null,
  merchant_org_number: "556677-8899",
  buyer_name: null,
  buyer_address: null,
  status: "verified",
  ...overrides,
});

const LIMIT = SE_VAT_RULES.simplifiedInvoiceMaxSek.value;

const check = (r: VatCheckInput) => checkSwedishVat(r, "SE");
const ids = (r: VatCheckInput) => {
  const result = check(r);
  return result.applies ? result.findings.map((f) => f.id) : null;
};

describe("checkSwedishVat — only for companies in Sweden", () => {
  it("doesn't run for a French company, another country or an unknown one", () => {
    const french = receipt({ currency: "EUR", merchant_vat_number: "FR40303265045", tax_rate: 20, total: 89 });
    expect(checkSwedishVat(french, "FR")).toEqual({ applies: false });
    expect(checkSwedishVat(receipt(), "OTHER")).toEqual({ applies: false });
    expect(checkSwedishVat(receipt(), null)).toEqual({ applies: false });
    expect(vatCheckSummary(french, "FR")).toBe("");
  });
});

describe("checkSwedishVat — simplified invoice (up to 4,000 kr)", () => {
  it("finds the seller's number and the VAT, and says what isn't checked", () => {
    const result = check(receipt());
    expect(result.applies && result.findings).toEqual([]);
    expect(result.applies && result.allClear).toMatchObject({
      found: "the seller’s number and the VAT",
      notChecked: "the date and what was bought",
      unconfirmed: false,
    });
    expect(vatCheckSummary(receipt(), "SE")).toBe("Seller id and VAT found");
  });

  it("marks an all-clear on an unconfirmed reading", () => {
    const pending = receipt({ status: "pending_review" });
    const result = check(pending);
    expect(result.applies && result.allClear?.unconfirmed).toBe(true);
    expect(vatCheckSummary(pending, "SE")).toBe("Seller id and VAT found (unconfirmed)");
  });

  it("accepts a VAT number, or a sole trader's personnummer, as the seller id", () => {
    expect(ids(receipt({ merchant_org_number: null, merchant_vat_number: "SE556677889901" }))).toEqual([]);
    expect(ids(receipt({ merchant_org_number: "19800101-1234" }))).toEqual([]);
  });

  it("accepts a VAT rate without the amount, and a breakdown with several rates", () => {
    expect(ids(receipt({ tax_amount: null, tax_rate: 25 }))).toEqual([]);
    expect(
      ids(receipt({ tax_amount: null, tax_rate: null, vat_breakdown: [{ rate: 6, vat_amount: 10 }, { rate: 25, vat_amount: 20 }] })),
    ).toEqual([]);
  });

  it("warns when the seller isn't identified, and doesn't count junk as an id", () => {
    expect(ids(receipt({ merchant_org_number: null }))).toEqual(["simplified_invoice_incomplete"]);
    expect(ids(receipt({ merchant_org_number: "N/A" }))).toEqual(["simplified_invoice_incomplete"]);
  });

  it("treats exactly 4,000 kr as a simplified invoice", () => {
    expect(ids(receipt({ total: LIMIT }))).toEqual([]);
  });

  it("leaves a tip out of the invoice total", () => {
    expect(ids(receipt({ total: 4100, tip_amount: 200 }))).toEqual([]);
  });
});

describe("checkSwedishVat — above 4,000 kr", () => {
  const big = { total: LIMIT + 0.01, tax_amount: 800, tax_rate: 25 };
  const fullInvoice = {
    merchant_vat_number: "SE556677889901",
    buyer_name: "Acme AB",
    buyer_address: "Storgatan 1, Stockholm",
  };

  it("asks for a full invoice when a till receipt lacks the buyer, without stating it as certain", () => {
    const result = check(receipt({ ...big, merchant_vat_number: "SE556677889901" }));
    expect(result.applies && result.findings.map((f) => f.id)).toEqual(["full_invoice_needed"]);
    const detail = result.applies ? result.findings[0].detail : "";
    expect(detail).toContain("Skatteverket may refuse");
    expect(detail).toContain("your company’s name and your company’s address");
  });

  it("needs the seller's VAT number; an org.nr isn't enough", () => {
    const result = check(receipt({ ...big, buyer_name: "Acme AB", buyer_address: "Storgatan 1" }));
    expect(result.applies && result.findings[0].detail).toContain("the seller’s VAT number");
  });

  it("passes a full invoice, saying the invoice number and amounts per rate aren't checked", () => {
    const result = check(receipt({ ...big, ...fullInvoice }));
    expect(result.applies && result.findings).toEqual([]);
    expect(result.applies && result.allClear?.notChecked).toContain("the invoice number");
    expect(vatCheckSummary(receipt({ ...big, ...fullInvoice }), "SE")).toBe("Seller VAT no., buyer and VAT found");
  });

  it("never gives the all-clear when no VAT is shown", () => {
    const result = check(receipt({ ...fullInvoice, total: 6000, tax_amount: null, tax_rate: null }));
    expect(result.applies && result.findings.map((f) => f.id)).toEqual(["no_vat_shown"]);
    expect(result.applies && result.allClear).toBeNull();
    expect(result.applies && result.findings[0].detail).toContain("it should be a full invoice");
  });
});

describe("checkSwedishVat — no VAT, foreign VAT, reverse charge", () => {
  it("doesn't tell an exempt seller to charge VAT", () => {
    const result = check(receipt({ tax_amount: null, tax_rate: null }));
    expect(result.applies && result.findings[0].id).toBe("no_vat_shown");
    expect(result.applies && result.findings[0].level).toBe("info");
    expect(result.applies && result.findings[0].detail).toContain("If the seller charged VAT");
  });

  it("doesn't apply when VAT is shown as zero", () => {
    expect(check(receipt({ tax_amount: 0, tax_rate: 0 }))).toEqual({ applies: false });
  });

  it("flags VAT charged by a seller with another EU VAT number", () => {
    const result = check(receipt({ merchant_vat_number: "FR40303265045", currency: "EUR", total: 89, tax_rate: 20, tax_amount: 14.83 }));
    expect(result.applies && result.findings.map((f) => [f.id, f.title])).toEqual([["foreign_vat", "Foreign VAT"]]);
    expect(result.applies && result.findings[0].detail).toContain("may be reclaimable");
  });

  it("reads no VAT from an EU seller as probably reverse charge, in any currency", () => {
    for (const currency of ["SEK", "EUR"]) {
      const result = check(
        receipt({ merchant_vat_number: "IE6388047V", merchant_org_number: null, currency, total: 500, tax_amount: null, tax_rate: null }),
      );
      expect(result.applies && result.findings.map((f) => f.id)).toEqual(["reverse_charge"]);
    }
  });

  it("flags VAT charged in another currency, with no Swedish seller id, as probably foreign", () => {
    const result = check(receipt({ merchant_org_number: null, currency: "EUR", total: 18.5, tax_amount: 1.68, tax_rate: 10 }));
    expect(result.applies && result.findings[0].title).toBe("Probably foreign VAT");
  });

  it("doesn't call a Swedish seller billing in euros foreign", () => {
    expect(check(receipt({ currency: "EUR" }))).toEqual({ applies: false });
    expect(check(receipt({ currency: "EUR", merchant_org_number: null, merchant_vat_number: "SE556677889901" }))).toEqual({ applies: false });
  });

  it("doesn't apply without a total or a currency", () => {
    expect(check(receipt({ total: null }))).toEqual({ applies: false });
    expect(check(receipt({ currency: null }))).toEqual({ applies: false });
  });
});

describe("checkSwedishVat — rates", () => {
  it("notes a rate that isn't Swedish, including inside a breakdown, and lists each once", () => {
    expect(ids(receipt({ tax_rate: 20 }))).toEqual(["unusual_rate"]);
    expect(ids(receipt({ tax_rate: 12 }))).toEqual([]);
    const result = check(
      receipt({ tax_rate: null, vat_breakdown: [{ rate: 7, vat_amount: 1 }, { rate: 19, vat_amount: 2 }, { rate: 7, vat_amount: 3 }] }),
    );
    expect(result.applies && result.findings[0].detail).toContain("7 % and 19 % aren’t Swedish VAT rates");
  });

  it("reads the breakdown's rates rather than a blended single rate", () => {
    expect(
      ids(receipt({ tax_rate: 9.4, vat_breakdown: [{ rate: 6, vat_amount: 10 }, { rate: 25, vat_amount: 20 }] })),
    ).toEqual([]);
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
