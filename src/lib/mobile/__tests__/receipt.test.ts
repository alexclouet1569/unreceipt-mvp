import { describe, expect, it } from "vitest";
import type { Receipt } from "@/lib/types";
import { toMobileReceipt } from "../receipt";

const base = {
  id: "r1",
  status: "verified",
  source: "email",
  merchant_name: "Uber",
  category: "transport",
  currency: "EUR",
  total: 12,
  purchased_at: null,
  receipt_date: "2026-11-08",
  image_url: null,
  original_source_url: null,
  original_source_kind: null,
  notes: null,
  created_at: "2026-11-08T10:00:00Z",
} as unknown as Receipt;

describe("toMobileReceipt", () => {
  it("names the original the way /api/receipts/[id]/original serves it", () => {
    const of = (over: Partial<Receipt>) => toMobileReceipt({ ...base, ...over }).original;
    expect(of({})).toBeNull();
    expect(of({ image_url: "u/a.jpg" })).toBe("image");
    expect(of({ original_source_url: "u/a.eml", original_source_kind: "eml" })).toBe("email");
    expect(of({ original_source_url: "u/a.txt", original_source_kind: "txt" })).toBe("text");
    expect(of({ original_source_url: "u/a.pdf", original_source_kind: "application/pdf" })).toBe("pdf");
    expect(of({ original_source_url: "u/a.png", original_source_kind: "image/png" })).toBe("image");
    // The stored original wins over a legacy photo.
    expect(of({ image_url: "u/a.jpg", original_source_url: "u/a.eml", original_source_kind: "eml" })).toBe("email");
  });

  it("falls back to the plain receipt date", () => {
    expect(toMobileReceipt(base).date).toBe("2026-11-08");
    expect(toMobileReceipt({ ...base, purchased_at: "2026-11-07T12:00:00Z" }).date).toBe("2026-11-07T12:00:00Z");
  });

  it("keeps the user's words and flags a duplicate instead of showing the server's English", () => {
    const notes =
      "Page 2 of 3 of a scanned PDF; the whole file is kept as the original. Possible duplicate: another receipt has the same merchant, amount and date.";
    expect(toMobileReceipt({ ...base, notes })).toMatchObject({ notes: null, possibleDuplicate: true });
    expect(toMobileReceipt({ ...base, notes: "Lunch with Anna" })).toMatchObject({ notes: "Lunch with Anna", possibleDuplicate: false });
  });
});
