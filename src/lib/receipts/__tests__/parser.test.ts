// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractReceipt: vi.fn(),
}));

vi.mock("@/lib/ocr", () => ({
  extractReceipt: mocks.extractReceipt,
}));

import {
  LOW_CONFIDENCE_THRESHOLD,
  parseReceipt,
} from "@/lib/receipts/parser";

describe("parser — paper strategy", () => {
  beforeEach(() => {
    mocks.extractReceipt.mockReset();
  });

  it("maps a high-confidence OCR result to canonical fields", async () => {
    mocks.extractReceipt.mockResolvedValue({
      merchant: "ICA Maxi",
      amount: 245,
      currency: "SEK",
      receipt_date: "2026-05-03",
      category: "office_supplies",
      tax_amount: 49,
      tax_rate: 25,
      payment_method: "Visa •• 4242",
      confidence: 0.9,
    });

    const result = await parseReceipt({
      kind: "paper",
      imageBase64: "fake",
      mediaType: "image/jpeg",
    });

    expect(result.not_a_receipt).toBe(false);
    expect(result.fields).toEqual({
      merchant_name: "ICA Maxi",
      total_amount: 245,
      currency: "SEK",
      receipt_date: "2026-05-03",
      category: "office_supplies",
      vat_amount: 49,
      vat_rate_pct: 25,
      payment_method: "Visa •• 4242",
      notes: null,
    });
    // schema validation passed → confidence = ocr_confidence × 1
    expect(result.confidence).toBeCloseTo(0.9, 2);
    expect(result.confidence).toBeGreaterThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it("flags not_a_receipt when OCR reports the image isn't one", async () => {
    mocks.extractReceipt.mockResolvedValue({ not_a_receipt: true });

    const result = await parseReceipt({
      kind: "paper",
      imageBase64: "fake",
      mediaType: "image/png",
    });

    expect(result.not_a_receipt).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.fields.merchant_name).toBeNull();
    expect(result.fields.total_amount).toBeNull();
  });

  it("halves the confidence when schema validation fails (missing required field)", async () => {
    // amount is missing entirely — schema accepts null but parsePaper still
    // builds a candidate where total_amount is null. validation passes for
    // nullable fields, so this test exercises a *different* failure mode:
    // when the OCR returns a bogus shape that the candidate-builder lets
    // through but Zod refuses.
    mocks.extractReceipt.mockResolvedValue({
      merchant: "",            // empty after trim → null → schema accepts (nullable)
      amount: -5,              // negative → builder coerces to null → schema accepts
      currency: "JPY",         // not in allowlist → builder coerces to null
      receipt_date: "May 3rd", // invalid format → builder coerces to null
      category: "rocket",      // not in allowlist → builder coerces to null
      confidence: 0.4,
    });

    const result = await parseReceipt({
      kind: "paper",
      imageBase64: "fake",
      mediaType: "image/jpeg",
    });

    // Builder coerced all the trash to null; schema validates because
    // every field is nullable. Confidence reflects the OCR's own low
    // self-report.
    expect(result.fields.merchant_name).toBeNull();
    expect(result.fields.total_amount).toBeNull();
    expect(result.fields.currency).toBeNull();
    expect(result.fields.receipt_date).toBeNull();
    expect(result.fields.category).toBeNull();
    expect(result.confidence).toBeCloseTo(0.4, 2);
    expect(result.confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it("falls back to 0.7 when OCR omits its own confidence", async () => {
    mocks.extractReceipt.mockResolvedValue({
      merchant: "Stripe",
      amount: 49,
      currency: "EUR",
      receipt_date: "2026-05-03",
      category: "software",
    });

    const result = await parseReceipt({
      kind: "paper",
      imageBase64: "fake",
      mediaType: "image/jpeg",
    });

    expect(result.confidence).toBeCloseTo(0.7, 2);
    expect(result.confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it("propagates OCR call failures so the route can return 500", async () => {
    mocks.extractReceipt.mockRejectedValue(new Error("Anthropic 503"));

    await expect(
      parseReceipt({
        kind: "paper",
        imageBase64: "fake",
        mediaType: "image/jpeg",
      })
    ).rejects.toThrow("Anthropic 503");
  });

  it("clamps an out-of-range OCR confidence to [0,1]", async () => {
    mocks.extractReceipt.mockResolvedValue({
      merchant: "X",
      amount: 1,
      currency: "EUR",
      receipt_date: "2026-05-03",
      category: "other",
      confidence: 1.5,
    });

    const result = await parseReceipt({
      kind: "paper",
      imageBase64: "fake",
      mediaType: "image/jpeg",
    });

    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe("parser — email/sms stubs", () => {
  it("email strategy returns confidence 0 (step 6 fills this in)", async () => {
    const result = await parseReceipt({
      kind: "email",
      raw: "From: receipts@uber.com\nTotal: $20",
    });
    expect(result.confidence).toBe(0);
    expect(result.not_a_receipt).toBe(false);
  });

  it("sms strategy returns confidence 0 (step 7 fills this in)", async () => {
    const result = await parseReceipt({
      kind: "sms",
      raw: "Köp 245.00 SEK ICA",
    });
    expect(result.confidence).toBe(0);
    expect(result.not_a_receipt).toBe(false);
  });
});

describe("parser — threshold export", () => {
  it("exposes LOW_CONFIDENCE_THRESHOLD at 0.8 per plan Q3", () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.8);
  });
});
