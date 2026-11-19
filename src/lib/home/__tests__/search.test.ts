import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import {
  parseAmount,
  parseReceiptSearch,
  parseSearchPeriod,
  parseSearchQuery,
  searchReceipts,
  SEARCH_MAX_LENGTH,
} from "../search";

describe("parseAmount", () => {
  it("reads the ways people type an amount", () => {
    expect(parseAmount("49")).toBe(49);
    expect(parseAmount("49,50")).toBe(49.5);
    expect(parseAmount("49.5")).toBe(49.5);
    expect(parseAmount("1 234,50")).toBe(1234.5);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("12 345")).toBe(12345);
    expect(parseAmount("49 kr")).toBe(49);
    expect(parseAmount("49kr")).toBe(49);
    expect(parseAmount("49:-")).toBe(49);
    expect(parseAmount("€12.90")).toBe(12.9);
    expect(parseAmount("SEK 99")).toBe(99);
  });

  it("is null for anything that isn't one amount", () => {
    for (const text of ["ICA", "2026-11", "1,2,3", "12.", "1.2345", "12,34,56", "1.234.5", "0", "12 34", "ica 49", ""]) {
      expect(parseAmount(text), text).toBeNull();
    }
  });
});

describe("parseSearchQuery", () => {
  it("keeps the text and adds the amount when it reads as one", () => {
    expect(parseSearchQuery("  ICA   Maxi ")).toEqual({ text: "ICA Maxi", amount: null });
    expect(parseSearchQuery("4421")).toEqual({ text: "4421", amount: 4421 });
  });

  it("is null when nothing was typed, and caps the length", () => {
    expect(parseSearchQuery(null)).toBeNull();
    expect(parseSearchQuery("   ")).toBeNull();
    expect(parseSearchQuery("a".repeat(500))!.text).toHaveLength(SEARCH_MAX_LENGTH);
    expect(parseSearchQuery("a\u0000b")!.text).toBe("a b");
  });
});

describe("parseSearchPeriod", () => {
  it("gives the days of a month or a year", () => {
    expect(parseSearchPeriod("2026-02", null)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(parseSearchPeriod("2028-02", null)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(parseSearchPeriod(null, "2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parseSearchPeriod("2026-11", "2025")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(parseSearchPeriod(null, null)).toBeNull();
    expect(parseSearchPeriod("", "")).toBeNull();
  });

  it("refuses a malformed or out-of-range period", () => {
    for (const [m, y] of [["2026-13", null], ["26-11", null], ["1999-01", null], [null, "abcd"], [null, "3000"]] as const) {
      expect(parseSearchPeriod(m, y)).toBe("invalid");
    }
  });
});

describe("parseReceiptSearch", () => {
  it("is null for the plain list and combines text with a period", () => {
    expect(parseReceiptSearch(new URLSearchParams(""))).toBeNull();
    expect(parseReceiptSearch(new URLSearchParams("q=ica&month=2026-11"))).toEqual({
      text: "ica",
      amount: null,
      period: { from: "2026-11-01", to: "2026-11-30" },
    });
    expect(parseReceiptSearch(new URLSearchParams("year=2026"))).toEqual({
      text: null,
      amount: null,
      period: { from: "2026-01-01", to: "2026-12-31" },
    });
    expect(parseReceiptSearch(new URLSearchParams("q=ica&month=nope"))).toBe("invalid");
  });
});

describe("searchReceipts", () => {
  it("asks the SQL function for one more than a page, scoped to the user", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i) }));
    rpc.mockResolvedValueOnce({ data: rows, error: null });
    const page = await searchReceipts(
      "user-1",
      { text: "ica", amount: null, period: { from: "2026-11-01", to: "2026-11-30" } },
      { purchasedAt: null, createdAt: "2026-11-02T13:00:00Z", id: "00000000-0000-0000-0000-000000000001" },
    );
    expect(rpc).toHaveBeenCalledWith("search_receipts", {
      p_user_id: "user-1",
      p_query: "ica",
      p_amount: null,
      p_from: "2026-11-01",
      p_to: "2026-11-30",
      p_after_purchased_at: null,
      p_after_created_at: "2026-11-02T13:00:00Z",
      p_after_id: "00000000-0000-0000-0000-000000000001",
      p_limit: 51,
    });
    expect(page.receipts).toHaveLength(50);
    expect(page.hasMore).toBe(true);
  });

  it("throws on a database error with its code only", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42883", message: "function does not exist" } });
    await expect(searchReceipts("user-1", { text: "x", amount: null, period: null }, null)).rejects.toThrow(
      "receipt search 42883",
    );
  });
});
