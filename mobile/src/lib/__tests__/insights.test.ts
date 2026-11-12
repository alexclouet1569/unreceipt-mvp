import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { sv } from "../../i18n/sv";
import {
  categoryColor,
  fillParts,
  bucketLabel,
  changeText,
  cumulative,
  insightFilter,
  insightText,
  periodCacheKey,
  periodQueryString,
  periodTitle,
  previousLabel,
  rangeLabel,
  shiftPeriod,
  todayIndex,
  type ReadyAnalytics,
} from "../insights";

function analytics(period: Partial<ReadyAnalytics["period"]>, today = "2026-11-11"): ReadyAnalytics {
  return {
    state: "ready",
    currency: "SEK",
    period: {
      kind: "month",
      key: "2026-11",
      from: "2026-11-01",
      to: "2026-11-30",
      previous: { from: "2026-10-01", to: "2026-10-31" },
      lastYear: { from: "2025-11-01", to: "2025-11-30" },
      current: true,
      ...period,
    },
    today,
    firstDay: "2025-01-01",
    total: { amount: 0, estimate: false, count: 0, toConfirm: 0, unconverted: [] },
    compare: { previous: null, lastYear: null },
    granularity: "day",
    buckets: [
      { from: "2026-11-10", to: "2026-11-10", amount: 0, count: 0 },
      { from: "2026-11-11", to: "2026-11-11", amount: 0, count: 0 },
    ],
    previousBuckets: [],
    categories: [],
    merchants: [],
    vat: { mode: "se", total: 0, rates: [], swedish: 0, representation: 0, toCheck: { amount: 0, count: 0 }, withoutVat: 0, foreign: 0 },
    insights: [],
    quality: { missingAmount: 0, toComplete: 0, unconverted: 0, undated: 0 },
  };
}

describe("periods", () => {
  it("builds the query and cache key", () => {
    expect(periodQueryString({ kind: "month" })).toBe("period=month");
    expect(periodQueryString({ kind: "quarter", anchor: "2026-Q3" })).toBe("period=quarter&anchor=2026-Q3");
    expect(periodQueryString({ kind: "custom", from: "2026-01-01", to: "2026-01-31" })).toBe(
      "period=custom&from=2026-01-01&to=2026-01-31",
    );
    expect(periodCacheKey({ kind: "month" })).toBe("month:now");
    expect(periodCacheKey({ kind: "custom", from: "2026-01-01", to: "2026-01-31" })).toBe("custom:2026-01-01_2026-01-31");
  });

  it("steps back across years and never into the future", () => {
    expect(shiftPeriod(analytics({ key: "2026-01", from: "2026-01-01" }), -1)).toEqual({ kind: "month", anchor: "2025-12" });
    expect(shiftPeriod(analytics({}), 1)).toBeNull();
    expect(shiftPeriod(analytics({ key: "2026-10", from: "2026-10-01" }), 1)).toEqual({ kind: "month", anchor: "2026-11" });
    expect(shiftPeriod(analytics({ kind: "quarter", key: "2026-Q1", from: "2026-01-01" }), -1)).toEqual({
      kind: "quarter",
      anchor: "2025-Q4",
    });
    expect(shiftPeriod(analytics({ kind: "year", key: "2026", from: "2026-01-01" }), 1)).toBeNull();
    expect(
      shiftPeriod(analytics({ kind: "custom", key: "x", from: "2026-03-01", to: "2026-03-10" }), -1),
    ).toEqual({ kind: "custom", from: "2026-02-19", to: "2026-02-28" });
  });

  it("names periods in the app's language", () => {
    expect(periodTitle({ kind: "month", key: "2026-11", from: "2026-11-01", to: "2026-11-30" }, "en", en)).toBe("November 2026");
    expect(periodTitle({ kind: "month", key: "2026-11", from: "2026-11-01", to: "2026-11-30" }, "sv", sv)).toBe("November 2026");
    expect(periodTitle({ kind: "quarter", key: "2026-Q4", from: "2026-10-01", to: "2026-12-31" }, "en", en)).toBe("Q4 2026");
    expect(periodTitle({ kind: "quarter", key: "2026-Q4", from: "2026-10-01", to: "2026-12-31" }, "sv", sv)).toBe("Kv 4 2026");
    expect(rangeLabel("2025-12-03", "2026-01-19", "en", en)).toBe("3 Dec 2025 – 19 Jan 2026");
    expect(previousLabel(analytics({}), "en", en)).toBe("October");
    expect(previousLabel(analytics({ key: "2026-01", from: "2026-01-01", previous: { from: "2025-12-01", to: "2025-12-31" } }), "en", en)).toBe(
      "Dec 2025",
    );
  });

  it("finds today's bar only in the current period", () => {
    expect(todayIndex(analytics({}))).toBe(1);
    expect(todayIndex(analytics({ current: false }))).toBe(-1);
  });
});

describe("numbers", () => {
  it("says the change, or nothing without a base", () => {
    expect(changeText(112, 100, "en")).toBe("+12%");
    expect(changeText(80, 100, "sv")).toMatch(/^[−-]20\s?%$/);
    expect(changeText(100, 0, "en")).toBeNull();
    expect(changeText(100, null, "en")).toBeNull();
    expect(changeText(100, 100, "en")).toBe("0%");
  });

  it("keeps running totals for the pace line", () => {
    expect(cumulative([10, 0, 5.5, 0.1])).toEqual([10, 10, 15.5, 15.6]);
  });

  it("labels bars", () => {
    expect(bucketLabel({ from: "2026-11-05" }, "day", "en")).toBe("5");
    expect(bucketLabel({ from: "2026-11-01" }, "month", "en")).toBe("Nov");
    expect(bucketLabel({ from: "2026-11-01" }, "month", "en", true)).toBe("November 2026");
  });
});

describe("findings", () => {
  it("writes each finding and knows which receipts are behind it", () => {
    const up = { kind: "category_up" as const, category: "travel" as const, amount: 1400, baseline: 400, pct: 250 };
    expect(insightText(up, "SEK", "en", en)).toEqual({
      title: "Travel up 250%",
      body: [
        { text: "1,400.00 kr", money: true },
        { text: " in this period, against about " },
        { text: "400.00 kr", money: true },
        { text: " usually." },
      ],
    });
    expect(insightFilter(up)).toEqual({ category: "travel" });
    const dup = { kind: "duplicates" as const, count: 1, ids: ["a"] };
    expect(insightText(dup, "SEK", "en", en).body[0].text).toMatch(/^1 receipt looks like another one/);
    expect(insightFilter(dup)).toEqual({ ids: "a" });
    expect(insightFilter({ kind: "recurring", merchant: "figma", name: "Figma", amount: 150, months: 4, ids: [] })).toEqual({
      merchant: "figma",
    });
  });
});

describe("parts and colours", () => {
  it("keeps amounts as their own parts", () => {
    expect(fillParts("{a} on {b} ({n})", { n: 3 }, { a: "10 kr", b: "8 kr" })).toEqual([
      { text: "10 kr", money: true },
      { text: " on " },
      { text: "8 kr", money: true },
      { text: " (3)" },
    ]);
  });

  it("never colours a category with the action green or honey", () => {
    const all = ["travel", "transport", "meals", "accommodation", "software", "office_supplies", "client_entertainment", "other"] as const;
    const used = all.map((c) => categoryColor(c));
    expect(used).not.toContain("#1A7F52");
    expect(used).not.toContain("#8C6320");
    expect(new Set(used).size).toBe(all.length);
  });

  it("gives every category its own colour on the dark palette, never the dark action green or honey", () => {
    const all = ["travel", "transport", "meals", "accommodation", "software", "office_supplies", "client_entertainment", "other"] as const;
    const used = all.map((c) => categoryColor(c, "dark"));
    expect(used).not.toContain("#27BE7B");
    expect(used).not.toContain("#E8B566");
    expect(new Set(used).size).toBe(all.length);
  });

  it("keeps every dark category colour but Other at 5.5:1 or more on the dark card (DESIGN.md)", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const card = lum("#1A1D33");
    const named = ["travel", "transport", "meals", "accommodation", "software", "office_supplies", "client_entertainment"] as const;
    for (const c of named) {
      expect((lum(categoryColor(c, "dark")) + 0.05) / (card + 0.05), c).toBeGreaterThanOrEqual(5.5);
    }
  });
});
