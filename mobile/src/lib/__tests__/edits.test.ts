import { describe, expect, it } from "vitest";
import type { MobileReceipt } from "@/lib/mobile/types";
import { applyPatch, parseAmount, toPlainDate } from "../edits";

describe("parseAmount", () => {
  it("reads amounts the way people type them in each country", () => {
    expect(parseAmount("245")).toBe(245);
    expect(parseAmount("245,50")).toBe(245.5);
    expect(parseAmount("245.5")).toBe(245.5);
    expect(parseAmount("1 305,50")).toBe(1305.5);
    expect(parseAmount("1 305,50")).toBe(1305.5);
    expect(parseAmount("1,305.50")).toBe(1305.5);
    expect(parseAmount("1.305,50")).toBe(1305.5);
    expect(parseAmount("1.305")).toBe(1305);
    expect(parseAmount("12,345")).toBe(12345);
    expect(parseAmount("9,999")).toBe(9999);
  });

  it("refuses what isn't a positive amount", () => {
    for (const bad of ["", "abc", "-5", "0", "0,00", "12a", "2000000"]) expect(parseAmount(bad), bad).toBeNull();
  });
});

describe("toPlainDate", () => {
  it("keeps the local day", () => {
    expect(toPlainDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("applyPatch", () => {
  const r: MobileReceipt = {
    id: "r1",
    status: "pending_review",
    missing: ["total"],
    source: "paper",
    merchant: "Café de Flore",
    category: "other",
    currency: "EUR",
    total: null,
    homeCurrency: "SEK",
    homeTotal: 120,
    fxSource: "ecb",
    date: "2026-11-09",
    createdAt: "2026-11-09T10:00:00Z",
    original: "image",
    notes: null,
    possibleDuplicate: false,
    exportedAt: null,
    bookedAt: null,
  };

  it("fills the field, recomputes what's missing and drops a stale conversion", () => {
    const next = applyPatch(r, { amount: 18.5 }, "verified");
    expect(next).toMatchObject({ total: 18.5, missing: [], status: "verified", homeTotal: null, fxSource: null });
  });

  it("keeps the conversion when only the category changes", () => {
    const next = applyPatch({ ...r, total: 18.5, missing: [] }, { category: "meals" }, "verified");
    expect(next).toMatchObject({ category: "meals", homeTotal: 120, fxSource: "ecb" });
  });
});
