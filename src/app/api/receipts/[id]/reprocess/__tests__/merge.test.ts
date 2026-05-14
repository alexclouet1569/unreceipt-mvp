// @vitest-environment node

import { describe, expect, it } from "vitest";
import { mergeExtraction } from "@/app/api/receipts/[id]/reprocess/route";
import type { Receipt } from "@/lib/types";

const baseRow = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: "00000000-0000-4000-8000-000000000000",
  transaction_id: null,
  user_id: "00000000-0000-4000-8000-000000000001",
  source: "paper",
  merchant_name: null,
  merchant_address: null,
  merchant_phone: null,
  merchant_vat_number: null,
  merchant_siret: null,
  category: "other",
  currency: "SEK",
  notes: null,
  receipt_number: null,
  receipt_date: null,
  receipt_time: null,
  purchased_at: null,
  subtotal: null,
  tax_amount: null,
  tax_rate: null,
  tip_amount: null,
  total: null,
  payment_method: null,
  card_last_four: null,
  transaction_ref: null,
  image_url: "user/abc.jpg",
  image_captured_at: null,
  status: "pending_review",
  verification_code: null,
  capture_time_seconds: null,
  ocr_confidence: null,
  is_verified: false,
  original_source_url: null,
  original_source_kind: null,
  intake_ref: null,
  parse_confidence: null,
  items: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  ...overrides,
});

describe("mergeExtraction", () => {
  it("backfills empty fields when row has no prior extraction", () => {
    const row = baseRow();
    const { patch, changed } = mergeExtraction(row, {
      merchant: "ICA Maxi",
      amount: 194,
      currency: "SEK",
      receipt_date: "2026-05-14",
      category: "meals",
      tax_amount: 23.31,
      tax_rate: 12,
      payment_method: "card",
      items: [
        { label: "Bröd", qty: null, unit_amount: null, total_amount: 45 },
        { label: "Mjölk", qty: 2, unit_amount: 15, total_amount: 30 },
      ],
      confidence: 0.92,
    });

    expect(patch.merchant_name).toBe("ICA Maxi");
    expect(patch.total).toBe(194);
    expect(patch.currency).toBe("SEK");
    expect(patch.receipt_date).toBe("2026-05-14");
    expect(patch.purchased_at).toBe("2026-05-14T12:00:00.000Z");
    expect(patch.category).toBe("meals");
    expect(patch.tax_amount).toBe(23.31);
    expect(patch.tax_rate).toBe(12);
    expect(patch.payment_method).toBe("card");
    expect(patch.items).toHaveLength(2);
    expect(patch.parse_confidence).toBe(0.92);
    expect(patch.status).toBe("verified");
    expect(changed).toContain("items");
    expect(changed).toContain("status");
  });

  it("does NOT overwrite user-edited fields when the new run is lower-confidence", () => {
    const row = baseRow({
      merchant_name: "ICA Maxi Liljeholmen",
      total: 194,
      currency: "SEK",
      receipt_date: "2026-05-14",
      purchased_at: "2026-05-14T12:00:00.000Z",
      parse_confidence: 0.95,
      status: "verified",
    });
    const { patch } = mergeExtraction(row, {
      merchant: "ICA", // shorter — model degraded
      amount: 200, // wrong
      currency: "SEK",
      receipt_date: "2026-05-14",
      confidence: 0.6,
    });

    expect(patch.merchant_name).toBeUndefined();
    expect(patch.total).toBeUndefined();
  });

  it("overwrites when the new run wins on confidence", () => {
    const row = baseRow({
      merchant_name: "ICA",
      total: 50,
      parse_confidence: 0.6,
    });
    const { patch } = mergeExtraction(row, {
      merchant: "ICA Maxi Liljeholmen",
      amount: 194,
      confidence: 0.95,
    });

    expect(patch.merchant_name).toBe("ICA Maxi Liljeholmen");
    expect(patch.total).toBe(194);
  });

  it("always backfills items when the row had none, regardless of confidence", () => {
    const row = baseRow({
      merchant_name: "ICA Maxi",
      total: 194,
      currency: "SEK",
      purchased_at: "2026-05-14T12:00:00.000Z",
      parse_confidence: 0.9,
      status: "verified",
      items: null,
    });
    const { patch, changed } = mergeExtraction(row, {
      items: [{ label: "Coffee", qty: null, unit_amount: null, total_amount: 35 }],
      confidence: 0.5, // lower than 0.9 but row had no items
    });

    expect(patch.items).toHaveLength(1);
    expect(changed).toContain("items");
  });

  it("does NOT overwrite existing items unless new run wins on confidence", () => {
    const row = baseRow({
      parse_confidence: 0.9,
      items: [{ label: "Existing", qty: null, unit_amount: null, total_amount: 10 }],
    });
    const { patch } = mergeExtraction(row, {
      items: [{ label: "New", qty: null, unit_amount: null, total_amount: 20 }],
      confidence: 0.5,
    });

    expect(patch.items).toBeUndefined();
  });

  it("recomputes status to verified when the merged view satisfies all requirements", () => {
    const row = baseRow({ status: "pending_review" });
    const { patch } = mergeExtraction(row, {
      merchant: "ICA",
      amount: 49,
      currency: "SEK",
      receipt_date: "2026-05-14",
      confidence: 0.9,
    });

    expect(patch.status).toBe("verified");
  });

  it("ignores unknown currency / category values", () => {
    const row = baseRow();
    const { patch } = mergeExtraction(row, {
      currency: "ZZZ",
      category: "not-a-real-category",
      confidence: 0.9,
    });

    expect(patch.currency).toBeUndefined();
    expect(patch.category).toBeUndefined();
  });
});
