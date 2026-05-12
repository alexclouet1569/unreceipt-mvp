import { describe, expect, it } from "vitest";
import {
  computeReceiptStatus,
  missingRequiredFields,
  PENDING_REVIEW_CONFIDENCE_THRESHOLD,
} from "@/lib/receipts/status";

describe("computeReceiptStatus", () => {
  it("returns 'verified' when all required fields are present and confidence is high", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "Uber",
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: 12.4,
        parse_confidence: 0.94,
      }),
    ).toBe("verified");
  });

  it("returns 'pending_review' when parse_confidence is below 0.75", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "Uber",
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: 12.4,
        parse_confidence: 0.6,
      }),
    ).toBe("pending_review");
  });

  it("treats the 0.75 boundary as 'verified' (>= threshold passes)", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "Uber",
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: 12.4,
        parse_confidence: PENDING_REVIEW_CONFIDENCE_THRESHOLD,
      }),
    ).toBe("verified");
  });

  it("returns 'pending_review' when merchant_name is null", () => {
    expect(
      computeReceiptStatus({
        merchant_name: null,
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: 12.4,
        parse_confidence: 0.99,
      }),
    ).toBe("pending_review");
  });

  it("returns 'pending_review' when merchant_name is whitespace-only", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "   ",
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: 12.4,
        parse_confidence: 0.99,
      }),
    ).toBe("pending_review");
  });

  it("returns 'pending_review' when both purchased_at and receipt_date are missing", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "Uber",
        purchased_at: null,
        receipt_date: null,
        total: 12.4,
        parse_confidence: 0.99,
      }),
    ).toBe("pending_review");
  });

  it("accepts receipt_date as a stand-in when purchased_at is missing (WOZ legacy)", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "Uber",
        purchased_at: null,
        receipt_date: "2026-05-12",
        total: 12.4,
        parse_confidence: 0.99,
      }),
    ).toBe("verified");
  });

  it("returns 'pending_review' when total is null", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "Uber",
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: null,
        parse_confidence: 0.99,
      }),
    ).toBe("pending_review");
  });

  it("does not penalise rows with a null parse_confidence (manual entries)", () => {
    expect(
      computeReceiptStatus({
        merchant_name: "ICA Maxi",
        purchased_at: "2026-05-12T12:00:00.000Z",
        total: 49,
        parse_confidence: null,
      }),
    ).toBe("verified");
  });
});

describe("missingRequiredFields", () => {
  it("reports every missing field, not just the first", () => {
    expect(
      missingRequiredFields({
        merchant_name: null,
        purchased_at: null,
        total: null,
      }).sort(),
    ).toEqual(["merchant", "purchased_at", "total"]);
  });

  it("reports nothing when the row is complete", () => {
    expect(
      missingRequiredFields({
        merchant_name: "Uber",
        purchased_at: "2026-05-12T08:30:00.000Z",
        total: 12.4,
      }),
    ).toEqual([]);
  });

  it("reports only the missing slice", () => {
    expect(
      missingRequiredFields({
        merchant_name: "Uber",
        purchased_at: null,
        receipt_date: null,
        total: 12.4,
      }),
    ).toEqual(["purchased_at"]);
  });
});
