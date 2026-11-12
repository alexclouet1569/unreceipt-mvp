import { describe, expect, it } from "vitest";
import {
  adjacentMonths,
  computeClientStats,
  monthBounds,
  monthKey,
  monthLabel,
  printedMonthFilter,
  receiptMonth,
  resolveMonth,
} from "@/lib/firm/client-stats";

const NOW = new Date("2026-11-10T12:00:00Z");

describe("monthKey / resolveMonth", () => {
  it("uses Stockholm time, so a late-UTC October receipt is November", () => {
    expect(monthKey("2026-10-31T23:30:00Z")).toBe("2026-11");
    expect(monthKey("2026-10-31T21:30:00Z")).toBe("2026-10");
    expect(monthKey("garbage")).toBe("");
  });

  it("takes a valid requested month, else the current one", () => {
    expect(resolveMonth("2026-03", NOW)).toBe("2026-03");
    expect(resolveMonth("2026-13", NOW)).toBe("2026-11");
    expect(resolveMonth(undefined, NOW)).toBe("2026-11");
  });
});

describe("computeClientStats", () => {
  it("counts per client for the month and new rows for the week", () => {
    const rows = [
      // in month, needs review, created today
      { organization_id: "a", status: "pending_review", exported_at: null, created_at: "2026-11-10T08:00:00Z", purchased_at: "2026-11-09T12:00:00Z" },
      // in month, ready, created 10 days ago
      { organization_id: "a", status: "verified", exported_at: null, created_at: "2026-10-31T08:00:00Z", purchased_at: "2026-11-02T12:00:00Z" },
      // in month, exported, created 7 days + 4 h ago (not new)
      { organization_id: "a", status: "verified", exported_at: "2026-11-05T00:00:00Z", created_at: "2026-11-03T08:00:00Z", purchased_at: "2026-11-03T12:00:00Z" },
      // previous month, created this week (new but not in month)
      { organization_id: "a", status: "verified", exported_at: null, created_at: "2026-11-09T08:00:00Z", purchased_at: "2026-10-20T12:00:00Z" },
      // other client, no purchased_at: falls back to created_at
      { organization_id: "b", status: "verified", exported_at: null, created_at: "2026-11-01T08:00:00Z", purchased_at: null },
      // no organisation: ignored
      { organization_id: null, status: "verified", exported_at: null, created_at: "2026-11-01T08:00:00Z", purchased_at: null },
    ];
    const stats = computeClientStats(rows, "2026-11", NOW);
    expect(stats.get("a")).toEqual({
      total: 3,
      reviewNeeded: 1,
      ready: 1,
      exported: 1,
      newThisWeek: 2,
      lastReceiptAt: "2026-11-10T08:00:00Z",
    });
    expect(stats.get("b")).toEqual({
      total: 1,
      reviewNeeded: 0,
      ready: 1,
      exported: 0,
      newThisWeek: 0,
      lastReceiptAt: "2026-11-01T08:00:00Z",
    });
    expect(stats.size).toBe(2);
  });
});

describe("month helpers", () => {
  it("bounds the month with a day of slack on each side", () => {
    expect(monthBounds("2026-11")).toEqual({
      from: "2026-10-31T00:00:00.000Z",
      to: "2026-12-02T00:00:00.000Z",
    });
  });

  it("walks across year ends", () => {
    expect(adjacentMonths("2026-01")).toEqual({ prev: "2025-12", next: "2026-02" });
    expect(adjacentMonths("2026-12")).toEqual({ prev: "2026-11", next: "2027-01" });
  });

  it("labels a month", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});

describe("printed month (firm pages)", () => {
  it("filters on receipt_date, else purchased_at's printed day, across the year end", () => {
    expect(printedMonthFilter("2026-12")).toBe(
      "and(receipt_date.gte.2026-12-01,receipt_date.lt.2027-01-01)," +
        "and(receipt_date.is.null,purchased_at.gte.2026-12-01T00:00:00Z,purchased_at.lt.2027-01-01T00:00:00Z)",
    );
  });

  it("files a receipt dated only by receipt_date in its printed month, not the month it arrived", () => {
    expect(receiptMonth({ receipt_date: "2026-09-14", purchased_at: null, created_at: "2026-11-02T08:00:00Z" })).toBe("2026-09");
  });
});
