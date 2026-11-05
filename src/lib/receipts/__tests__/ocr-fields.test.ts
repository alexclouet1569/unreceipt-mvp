import { describe, expect, it } from "vitest";
import { ATTACHMENT_CONFIDENCE_CAP, fieldsFromOcr } from "@/lib/receipts/ocr-fields";

describe("fieldsFromOcr", () => {
  it("maps a full answer and caps the confidence below the review threshold", () => {
    const fields = fieldsFromOcr({
      merchant: " ICA Maxi ",
      amount: 181,
      currency: "SEK",
      receipt_date: "2026-11-02",
      category: "meals",
      tax_amount: 31,
      tax_rate: 25,
      seller_org_number: "556677-8899",
      seller_vat_number: "SE556677889901",
      vat_lines: [{ rate: 25, net: 100, vat: 25 }, { rate: 12, vat: 6 }],
      payment_method: "card",
      items: [{ label: "Mjölk", qty: 1, unit_amount: 15, total_amount: 15 }],
      confidence: 0.98,
    });
    expect(fields).toMatchObject({
      merchant_name: "ICA Maxi",
      purchased_at: "2026-11-02T12:00:00.000Z",
      total: 181,
      currency: "SEK",
      category: "meals",
      tax_amount: 31,
      tax_rate: 25,
      seller_org_number: "556677-8899",
      merchant_vat_number: "SE556677889901",
      vat_lines: [
        { rate: 25, net: 100, vat: 25 },
        { rate: 12, net: null, vat: 6 },
      ],
      payment_method: "card",
      items: [{ label: "Mjölk", qty: 1, unit_amount: 15, total_amount: 15 }],
      parse_confidence: ATTACHMENT_CONFIDENCE_CAP,
    });
  });

  it("is null without the required fields or for a non-receipt", () => {
    expect(fieldsFromOcr({ not_a_receipt: true })).toBeNull();
    expect(fieldsFromOcr({ merchant: "ICA", amount: 10 })).toBeNull();
    expect(fieldsFromOcr({ merchant: "ICA", amount: 0, receipt_date: "2026-11-02" })).toBeNull();
    expect(fieldsFromOcr({ merchant: "ICA", amount: 10, receipt_date: "2/11/2026" })).toBeNull();
  });

  it("never derives a currency: an unsupported one means no fields", () => {
    expect(fieldsFromOcr({ merchant: "X", amount: 10, receipt_date: "2026-11-02", currency: "DKK" })).toBeNull();
    expect(fieldsFromOcr({ merchant: "X", amount: 10, receipt_date: "2026-11-02" })).toBeNull();
  });

  it("drops an unknown category, a VAT above the total and a split that doesn't add up", () => {
    const fields = fieldsFromOcr({
      merchant: "X",
      amount: 10,
      receipt_date: "2026-11-02",
      currency: "SEK",
      category: "pets",
      tax_amount: 12,
      vat_lines: [{ rate: 25, vat: 2 }],
    });
    expect(fields).toMatchObject({ category: null, tax_amount: null });
    const split = fieldsFromOcr({ merchant: "X", amount: 125, receipt_date: "2026-11-02", currency: "SEK", tax_amount: 25, vat_lines: [{ rate: 25, vat: 20 }] });
    expect(split?.vat_lines).toBeNull();
  });
});
