import { describe, expect, it } from "vitest";
import { looksLikeSameReceipt, scanFields } from "../scan-fields";

describe("scanFields", () => {
  it("keeps a full reading but below the review threshold, so a person confirms it", () => {
    const f = scanFields(
      { merchant: "Byggmax", amount: 2486, currency: "SEK", receipt_date: "2026-11-01", category: "office_supplies", tax_amount: 497.2, tax_rate: 25, confidence: 0.98 },
      "SEK"
    )!;
    expect(f).toMatchObject({ merchant_name: "Byggmax", total: 2486, receipt_date: "2026-11-01", purchased_at: "2026-11-01T12:00:00.000Z", tax_amount: 497.2 });
    expect(f.parse_confidence).toBeLessThan(0.75);
  });

  it("keeps what was read when something is missing, VAT and seller ids included", () => {
    const f = scanFields(
      { merchant: "EasyPark", amount: 60, currency: "SEK", tax_amount: 12, tax_rate: 25, seller_org_number: "556677-8899", confidence: 0.9 },
      "SEK"
    )!;
    expect(f).toMatchObject({ merchant_name: "EasyPark", total: 60, receipt_date: null, tax_amount: 12, tax_rate: 25, seller_org_number: "556677-8899" });
    expect(f.parse_confidence).toBeLessThan(0.75);
  });

  it("never turns a currency it can't handle into the company's: the amount is left to fill in", () => {
    // 500 DKK must not become 500 SEK.
    expect(scanFields({ merchant: "Netto", amount: 500, currency: "DKK", receipt_date: "2026-11-03" }, "SEK")).toMatchObject({
      total: null,
      currency: "SEK",
      tax_amount: null,
    });
    expect(scanFields({ merchant: "Netto", amount: 500, receipt_date: "2026-11-03" }, "SEK")!.total).toBeNull();
  });

  it("strips anything that could be a card number from the payment method", () => {
    expect(scanFields({ merchant: "X", payment_method: "Visa 4111 1111 1111 1111" }, "SEK")!.payment_method).toBe("Visa •••");
    expect(scanFields({ merchant: "X", payment_method: "Mastercard ****1234" }, "SEK")!.payment_method).toBe("Mastercard ****1234");
  });

  it("saves nothing for a picture that isn't a receipt", () => {
    expect(scanFields({ not_a_receipt: true }, "SEK")).toBeNull();
  });

  it("reads nothing as an empty receipt waiting to be filled in", () => {
    expect(scanFields({}, "EUR")).toMatchObject({ merchant_name: null, total: null, receipt_date: null, currency: "EUR" });
  });
});

describe("looksLikeSameReceipt", () => {
  const a = { merchant_name: "Circle K", total: 812, receipt_date: "2026-11-01" };
  it("matches merchant (case and spaces aside), amount and day", () => {
    expect(looksLikeSameReceipt(a, { merchant_name: " circle  k ", total: 812, receipt_date: "2026-11-01" })).toBe(true);
    expect(looksLikeSameReceipt(a, { ...a, total: 813 })).toBe(false);
    expect(looksLikeSameReceipt(a, { ...a, receipt_date: "2026-11-02" })).toBe(false);
    expect(looksLikeSameReceipt({ ...a, merchant_name: null }, { ...a, merchant_name: null })).toBe(false);
  });
});

describe("pdfPageCount", () => {
  it("counts pages stored in compressed object streams, and refuses what it can't open", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const { countPdfPages, pdfPageCount } = await import("../pdf-pages");
    const doc = await PDFDocument.create();
    for (let i = 0; i < 20; i++) doc.addPage([200, 300]);
    const bytes = Buffer.from(await doc.save({ useObjectStreams: true }));
    expect(countPdfPages(bytes)).toBe(0);
    expect(await pdfPageCount(bytes)).toBe(20);
    expect(await pdfPageCount(Buffer.from("not a pdf"))).toBeNull();
  });
});
