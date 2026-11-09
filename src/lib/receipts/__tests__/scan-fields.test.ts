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

  it("keeps what was read when something is missing", () => {
    const f = scanFields({ merchant: "EasyPark", amount: undefined, receipt_date: "2026-11-03", currency: "XYZ", confidence: 0.9 }, "SEK")!;
    expect(f).toMatchObject({ merchant_name: "EasyPark", total: null, receipt_date: "2026-11-03", currency: "SEK", category: "other" });
    expect(f.parse_confidence).toBeLessThan(0.75);
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
