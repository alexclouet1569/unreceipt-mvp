import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  categoryColor,
  changeText,
  fillParts,
  insightFilter,
  insightText,
  periodSearch,
  periodTitle,
  previousLabel,
  previousLegend,
  shiftPeriod,
  type ReadyAnalytics,
} from "../display";

function analytics(period: Partial<ReadyAnalytics["period"]>, today = "2026-11-12"): ReadyAnalytics {
  return {
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
  } as ReadyAnalytics;
}

describe("periods", () => {
  it("builds the page's query for each kind", () => {
    expect(periodSearch({ kind: "month" })).toBe("period=month");
    expect(periodSearch({ kind: "quarter", anchor: "2026-Q3" })).toBe("period=quarter&anchor=2026-Q3");
    expect(periodSearch({ kind: "custom", from: "2026-01-05", to: "2026-03-02" })).toBe(
      "period=custom&from=2026-01-05&to=2026-03-02",
    );
  });

  it("steps back across a year and never forward into the future", () => {
    expect(shiftPeriod(analytics({ key: "2026-01", from: "2026-01-01", to: "2026-01-31" }), -1)).toEqual({
      kind: "month",
      anchor: "2025-12",
    });
    expect(shiftPeriod(analytics({}), 1)).toBeNull();
    expect(
      shiftPeriod(analytics({ kind: "quarter", key: "2026-Q1", from: "2026-01-01", to: "2026-03-31" }), -1),
    ).toEqual({ kind: "quarter", anchor: "2025-Q4" });
  });

  it("moves chosen dates by their own length", () => {
    const a = analytics({ kind: "custom", key: "x", from: "2026-10-01", to: "2026-10-10" });
    expect(shiftPeriod(a, -1)).toEqual({ kind: "custom", from: "2026-09-21", to: "2026-09-30" });
  });

  it("names periods and the one before", () => {
    expect(periodTitle({ kind: "month", key: "2026-11", from: "2026-11-01", to: "2026-11-30" })).toBe("November 2026");
    expect(periodTitle({ kind: "quarter", key: "2026-Q4", from: "2026-10-01", to: "2026-12-31" })).toBe("Q4 2026");
    expect(periodTitle({ kind: "custom", key: "x", from: "2025-12-03", to: "2026-01-19" })).toBe("3 Dec 2025 – 19 Jan 2026");
    expect(previousLabel(analytics({}))).toBe("October");
    expect(
      previousLabel(
        analytics({ key: "2026-01", from: "2026-01-01", previous: { from: "2025-12-01", to: "2025-12-31" } }),
      ),
    ).toBe("Dec 2025");
  });
});

describe("texts", () => {
  it("writes a neutral change, or nothing without a base", () => {
    expect(changeText(112, 100)).toBe("+12%");
    expect(changeText(95, 100)).toBe("-5%");
    expect(changeText(100, 0)).toBeNull();
    expect(changeText(100, null)).toBeNull();
  });

  it("keeps amounts as their own parts (Geist Mono in sentences)", () => {
    expect(fillParts("{a} on {b} ({n})", { n: 3 }, { a: "10 kr", b: "8 kr" })).toEqual([
      { text: "10 kr", money: true },
      { text: " on " },
      { text: "8 kr", money: true },
      { text: " (3)" },
    ]);
  });

  it("never claims a deduction in the client entertainment finding", () => {
    const t = insightText({ kind: "representation", amount: 1000, vat: 200, ids: [] }, "SEK");
    const words = t.body.map((p) => p.text).join("") + t.title;
    expect(words).not.toMatch(/deductible|reclaim/i);
  });

  it("opens the receipts behind a finding", () => {
    expect(insightFilter({ kind: "category_up", category: "meals", amount: 1, baseline: 1, pct: 50 })).toEqual({
      category: "meals",
    });
    expect(insightFilter({ kind: "largest", name: "SJ", amount: 1, share: 0.5, ids: ["a", "b"] })).toEqual({ ids: "a,b" });
    expect(insightFilter({ kind: "duplicates", count: 0, ids: [] })).toBeNull();
  });

  it("labels bars, a month's blocks by their days", () => {
    expect(bucketLabel({ from: "2026-11-05", to: "2026-11-05" }, "day")).toBe("5");
    expect(bucketLabel({ from: "2026-11-01", to: "2026-11-30" }, "month")).toBe("Nov");
    expect(bucketLabel({ from: "2026-11-01", to: "2026-11-07" }, "week", false, true)).toBe("1–7");
    expect(bucketLabel({ from: "2026-11-01", to: "2026-11-07" }, "week", true, true)).toBe("1–7 November");
    expect(bucketLabel({ from: "2026-11-29", to: "2026-11-30" }, "week", false, true)).toBe("29–30");
    // A quarter's Monday week keeps its month, inside one month or across two.
    expect(bucketLabel({ from: "2026-10-05", to: "2026-10-11" }, "week")).toBe("5 Oct");
    expect(bucketLabel({ from: "2026-10-05", to: "2026-10-11" }, "week", true)).toBe("Week of 5 October");
    expect(bucketLabel({ from: "2026-09-28", to: "2026-10-04" }, "week")).toMatch(/^28 Sep/);
  });

  it("capitalises the period before in the legend", () => {
    expect(previousLegend(analytics({ kind: "custom", key: "x" }))).toBe("The period before");
    expect(previousLegend(analytics({}))).toBe("October");
  });

  it("colours categories from CSS variables, Other neutral", () => {
    expect(categoryColor("client_entertainment")).toBe("var(--category-client-entertainment)");
    expect(categoryColor("other")).toBe("var(--category-other)");
  });
});
