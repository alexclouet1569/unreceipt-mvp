import { describe, expect, it } from "vitest";
import { fillFromText, partialAttachmentFields } from "../attachment-fields";

const text = {
  merchant_name: "ICA",
  purchased_at: "2026-11-02T12:00:00.000Z",
  total: 181,
  currency: "SEK",
  tax_amount: 36.2,
  tax_rate: 25,
  category: "meals",
  card_last_four: "4242",
  parse_confidence: 0.95,
};

describe("partialAttachmentFields", () => {
  it("keeps each field OCR read, with the company's currency when none was read and no amount then", () => {
    expect(partialAttachmentFields({ merchant: "ICA Maxi", amount: 181 }, "SEK")).toMatchObject({
      merchant_name: "ICA Maxi",
      total: null,
      currency: "SEK",
      receipt_date: null,
      category: "other",
    });
    expect(partialAttachmentFields({ amount: 12, currency: "EUR", confidence: 0.99 }, "SEK")).toMatchObject({
      total: 12,
      currency: "EUR",
      parse_confidence: 0.7,
    });
  });

  it("is null when the model saw no receipt or read none of merchant, amount and date", () => {
    expect(partialAttachmentFields({ not_a_receipt: true }, "SEK")).toBeNull();
    expect(partialAttachmentFields({}, "SEK")).toBeNull();
    expect(partialAttachmentFields({ category: "meals", currency: "SEK" }, "SEK")).toBeNull();
  });
});

describe("fillFromText", () => {
  it("fills only the gaps, never overwriting what OCR read, and stays below the review threshold", () => {
    const partial = partialAttachmentFields({ merchant: "ICA Maxi", currency: "SEK" }, "SEK")!;
    const out = fillFromText(partial, text, "SEK");
    expect(out).toMatchObject({
      merchant_name: "ICA Maxi",
      total: 181,
      currency: "SEK",
      receipt_date: "2026-11-02",
      purchased_at: "2026-11-02T12:00:00.000Z",
      tax_amount: 36.2,
      tax_rate: 25,
      category: "meals",
      card_last_four: "4242",
    });
    expect(out.parse_confidence).toBeLessThanOrEqual(0.7);
  });

  it("takes the text's amount only with its own currency, and only when OCR saw none or the same", () => {
    const partial = partialAttachmentFields({ merchant: "Netto", receipt_date: "2026-11-02" }, "SEK")!;
    expect(fillFromText(partial, text, undefined)).toMatchObject({ total: 181, currency: "SEK" });
    expect(fillFromText(partial, text, "GBP")).toMatchObject({ total: null, currency: "SEK" });
    expect(fillFromText(partial, text, "DKK")).toMatchObject({ total: null, tax_amount: null });
    expect(fillFromText(partial, { ...text, currency: "EUR" }, undefined)).toMatchObject({ total: 181, currency: "EUR" });
  });

  it("keeps OCR's date over the text's", () => {
    const partial = partialAttachmentFields({ receipt_date: "2026-10-30" }, "SEK")!;
    expect(fillFromText(partial, text, null)).toMatchObject({ receipt_date: "2026-10-30", merchant_name: "ICA" });
  });

  it("only caps the confidence when there is no text reading", () => {
    const partial = { ...partialAttachmentFields({ merchant: "X" }, "SEK")!, parse_confidence: 0.99 };
    expect(fillFromText(partial, null, null)).toMatchObject({ merchant_name: "X", total: null, parse_confidence: 0.7 });
  });
});
