import { describe, expect, it } from "vitest";
import type { MobileReceipt } from "@/lib/mobile/types";
import {
  ALL_TIME,
  categoryCounts,
  filterByCategory,
  inPeriod,
  periodsFor,
  receiptMonthKey,
  totalsFor,
} from "../summary";

const now = new Date(2026, 10, 11, 12, 0);

const r = (id: string, over: Partial<MobileReceipt> = {}): MobileReceipt => ({
  id,
  status: "verified",
  missing: [],
  source: "email",
  merchant: "ICA",
  category: "meals",
  currency: "SEK",
  total: 10,
  homeCurrency: "SEK",
  homeTotal: 10,
  fxSource: "same",
  date: "2026-11-09",
  createdAt: "2026-11-09T10:00:00Z",
  original: null,
  notes: null,
  possibleDuplicate: false,
  exportedAt: null,
  bookedAt: null,
  ...over,
});

describe("summary periods", () => {
  it("reads a plain date as that calendar day", () => {
    expect(receiptMonthKey({ date: "2026-11-01" })).toBe("2026-11");
    expect(receiptMonthKey({ date: null })).toBeNull();
  });

  it("starts on this month, then months with receipts newest first, then all time", () => {
    const periods = periodsFor(
      [r("a", { date: "2026-09-03" }), r("b", { date: "2025-12-24" }), r("c", { date: null })],
      "en",
      "All time",
      now,
    );
    expect(periods.map((p) => p.key)).toEqual(["2026-11", "2026-09", "2025-12", ALL_TIME]);
    expect(periods.map((p) => p.label)).toEqual(["November", "September", "December 2025", "All time"]);
  });

  it("keeps a month's receipts, or all of them", () => {
    const list = [r("a"), r("b", { date: "2026-10-31" }), r("c", { date: null })];
    expect(inPeriod(list, "2026-11").map((x) => x.id)).toEqual(["a"]);
    expect(inPeriod(list, ALL_TIME)).toHaveLength(3);
  });
});

describe("summary totals", () => {
  it("adds foreign receipts with their converted amount and marks ECB estimates", () => {
    const totals = totalsFor(
      [
        r("a", { total: 100.1, homeTotal: 100.1 }),
        r("b", { currency: "EUR", total: 10, homeTotal: 115.2, fxSource: "ecb" }),
        r("c", { total: 0.2, homeTotal: 0.2 }),
      ],
      "SEK",
    );
    expect(totals).toEqual([{ amount: 215.5, currency: "SEK", estimate: true }]);
  });

  it("keeps a receipt not converted yet apart, never added in", () => {
    const totals = totalsFor(
      [r("a", { total: 50, homeTotal: 50 }), r("b", { currency: "EUR", total: 18.5, homeTotal: null, homeCurrency: null, fxSource: null })],
      "SEK",
    );
    expect(totals).toEqual([
      { amount: 50, currency: "SEK", estimate: false },
      { amount: 18.5, currency: "EUR", estimate: false },
    ]);
  });

  it("shows zero in the company's currency, first, when nothing is in it", () => {
    expect(totalsFor([], "EUR")).toEqual([{ amount: 0, currency: "EUR", estimate: false }]);
    expect(totalsFor([r("a", { currency: "USD", total: 5, homeTotal: null, homeCurrency: null })], "SEK")[0].currency).toBe(
      "SEK",
    );
  });

  it("skips receipts without an amount", () => {
    expect(totalsFor([r("a", { total: null, homeTotal: null })], "SEK")).toEqual([
      { amount: 0, currency: "SEK", estimate: false },
    ]);
  });
});

describe("category filter", () => {
  const list = [r("a"), r("b", { category: "transport" }), r("c", { category: "transport" }), r("d", { category: "other" })];

  it("lists used categories, most used first", () => {
    expect(categoryCounts(list)).toEqual([
      { key: "transport", count: 2 },
      { key: "meals", count: 1 },
      { key: "other", count: 1 },
    ]);
  });

  it("filters, and falls back to all when the category has no receipt left", () => {
    expect(filterByCategory(list, "transport").receipts.map((x) => x.id)).toEqual(["b", "c"]);
    expect(filterByCategory(list, "software")).toEqual({ category: null, receipts: list });
    expect(filterByCategory(list, null).category).toBeNull();
  });
});
