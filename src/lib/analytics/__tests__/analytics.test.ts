// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildAnalytics, olderSummary } from "../aggregate";
import { merchantKey } from "../merchants";
import { contribution, purchaseDay, Sum, type AnalyticsRow } from "../money";
import { bucketsFor, granularityFor, minusYear, resolvePeriod } from "../periods";
import { needsVatCheck, vatFor } from "../vat";
import { DUPLICATE_NOTE } from "@/lib/receipts/notes";

let n = 0;
function row(over: Partial<AnalyticsRow> = {}): AnalyticsRow {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    merchant_name: "ICA Kvantum",
    category: "meals",
    currency: "SEK",
    total: 100,
    home_total: null,
    home_currency: null,
    fx_rate: null,
    fx_source: null,
    fx_date: null,
    purchased_at: null,
    receipt_date: "2026-11-05",
    created_at: "2026-11-05T10:00:00Z",
    status: "verified",
    tax_amount: null,
    tax_rate: null,
    vat_lines: null,
    notes: null,
    bas_account: null,
    seller_org_number: null,
    merchant_vat_number: null,
    ...over,
  };
}

const month = (key: string) => resolvePeriod({ kind: "month", anchor: key }, "2026-11-11")!;

describe("periods", () => {
  it("resolves a month with the month before and the same month last year", () => {
    const p = month("2026-03");
    expect(p).toMatchObject({
      key: "2026-03",
      from: "2026-03-01",
      to: "2026-03-31",
      previous: { from: "2026-02-01", to: "2026-02-28" },
      lastYear: { from: "2025-03-01", to: "2025-03-31" },
      granularity: "day",
    });
    expect(month("2026-01").previous).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("defaults to the period that holds today", () => {
    expect(resolvePeriod({}, "2026-11-11")?.key).toBe("2026-11");
    expect(resolvePeriod({ kind: "quarter" }, "2026-11-11")).toMatchObject({
      key: "2026-Q4",
      from: "2026-10-01",
      to: "2026-12-31",
      previous: { from: "2026-07-01", to: "2026-09-30" },
    });
    expect(resolvePeriod({ kind: "quarter", anchor: "2026-Q1" }, "2026-11-11")?.previous).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
    expect(resolvePeriod({ kind: "year" }, "2026-11-11")).toMatchObject({ key: "2026", granularity: "month" });
  });

  it("checks a custom range and compares it with the same number of days before", () => {
    const p = resolvePeriod({ kind: "custom", from: "2026-03-10", to: "2026-03-19" }, "2026-11-11")!;
    expect(p.previous).toEqual({ from: "2026-02-28", to: "2026-03-09" });
    expect(p.granularity).toBe("day");
    expect(resolvePeriod({ kind: "custom", from: "2026-03-19", to: "2026-03-10" }, "2026-11-11")).toBeNull();
    expect(resolvePeriod({ kind: "custom", from: "2026-02-30", to: "2026-03-10" }, "2026-11-11")).toBeNull();
    expect(resolvePeriod({ kind: "custom", from: "2020-01-01", to: "2026-03-10" }, "2026-11-11")).toBeNull();
    expect(resolvePeriod({ kind: "month", anchor: "2026-13" }, "2026-11-11")).toBeNull();
    expect(resolvePeriod({ kind: "week" }, "2026-11-11")).toBeNull();
  });

  it("keeps 29 February inside February a year earlier", () => {
    expect(minusYear("2028-02-29")).toBe("2027-02-28");
  });

  it("cuts a range into days, Monday weeks or months", () => {
    expect(granularityFor("2026-01-01", "2026-01-31")).toBe("day");
    expect(granularityFor("2026-01-01", "2026-03-31")).toBe("week");
    expect(granularityFor("2026-01-01", "2026-12-31")).toBe("month");
    const weeks = bucketsFor({ from: "2026-10-01", to: "2026-10-31" }, "week");
    // 1 Oct 2026 is a Thursday: the first week is cut short.
    expect(weeks[0]).toEqual({ from: "2026-10-01", to: "2026-10-04" });
    expect(weeks[1]).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(weeks.at(-1)).toEqual({ from: "2026-10-26", to: "2026-10-31" });
    expect(bucketsFor({ from: "2026-01-01", to: "2026-12-31" }, "month")).toHaveLength(12);
  });
});

describe("money", () => {
  it("dates a purchase by its printed day, never shifted and never by its upload", () => {
    // purchased_at holds the receipt's own clock time with a "Z": an evening
    // receipt at a year, quarter or month end stays in its period.
    expect(purchaseDay({ purchased_at: "2026-12-31T23:15:00.000Z", receipt_date: null })).toBe("2026-12-31");
    expect(purchaseDay({ purchased_at: "2026-03-31T23:30:00.000Z", receipt_date: null })).toBe("2026-03-31");
    expect(purchaseDay({ purchased_at: "2026-06-30T22:10:00.000Z", receipt_date: null })).toBe("2026-06-30");
    // DST change night.
    expect(purchaseDay({ purchased_at: "2026-10-25T02:30:00.000Z", receipt_date: null })).toBe("2026-10-25");
    // The printed date wins.
    expect(purchaseDay({ purchased_at: "2026-11-01T00:30:00.000Z", receipt_date: "2026-10-31" })).toBe("2026-10-31");
    expect(purchaseDay({ purchased_at: null, receipt_date: "2026-10-31" })).toBe("2026-10-31");
    expect(purchaseDay({ purchased_at: null, receipt_date: null })).toBeNull();
  });

  it("adds converted amounts, keeps unconverted ones apart, marks estimates", () => {
    const s = new Sum();
    s.add(contribution(row({ total: 100 }), "SEK"));
    s.add(contribution(row({ currency: "EUR", total: 10, home_total: 115.2, home_currency: "SEK", fx_source: "ecb" }), "SEK"));
    s.add(contribution(row({ currency: "USD", total: 20 }), "SEK"));
    s.add(contribution(row({ total: null }), "SEK"));
    // Converted to another currency (the company changed it): not added in.
    s.add(contribution(row({ currency: "EUR", total: 5, home_total: 5, home_currency: "EUR", fx_source: "same" }), "SEK"));
    expect(s.lines("SEK")).toEqual([
      { amount: 215.2, currency: "SEK", estimate: true },
      { amount: 5, currency: "EUR", estimate: false },
      { amount: 20, currency: "USD", estimate: false },
    ]);
    expect(s.missingAmount).toBe(1);
    expect(s.count).toBe(5);
  });
});

describe("merchants", () => {
  it("groups spellings of one merchant, never two different ones", () => {
    expect(merchantKey("ICA Kvantum")).toBe(merchantKey("ICA KVANTUM AB"));
    expect(merchantKey("Uber B.V.")).toBe("uber b v");
    expect(merchantKey("Clas Ohlson AB (publ)")).toBe("clas ohlson");
    expect(merchantKey("Åhléns")).toBe("åhléns");
    expect(merchantKey("AB")).toBe("ab");
    expect(merchantKey("  ")).toBeNull();
    expect(merchantKey("ICA Maxi")).not.toBe(merchantKey("ICA Kvantum"));
  });
});

describe("vat", () => {
  it("tells Swedish-rate VAT on confirmed receipts from what needs a look, representation apart", () => {
    const vat = vatFor(
      [
        row({ total: 125, tax_amount: 25, tax_rate: 25 }),
        row({ total: 112, vat_lines: [{ rate: 12, net: 100, vat: 12 }] }),
        // Several rates, 6 % included.
        row({ total: 231, vat_lines: [{ rate: 25, net: 100, vat: 25 }, { rate: 6, net: 100, vat: 6 }] }),
        row({ total: 250, tax_amount: 50, tax_rate: 25, category: "client_entertainment" }),
        // Not confirmed yet: to check.
        row({ total: 125, tax_amount: 25, tax_rate: 25, status: "pending_review" }),
        // A rate that isn't Swedish, and one that couldn't be read: to check.
        row({ total: 120, tax_amount: 20, tax_rate: 20 }),
        row({ total: 100, tax_amount: 9 }),
        // A refund nets out.
        row({ total: -125, tax_amount: -25, tax_rate: 25 }),
        row({ total: 80 }),
        row({ currency: "EUR", total: 12, tax_amount: 2 }),
      ],
      "SEK",
      "SE"
    );
    expect(vat).toEqual({
      mode: "se",
      total: 147,
      rates: [
        { rate: 25, net: 400, vat: 100 },
        { rate: 20, net: 100, vat: 20 },
        { rate: 12, net: 100, vat: 12 },
        { rate: 6, net: 100, vat: 6 },
        { rate: null, net: 91, vat: 9 },
      ],
      swedish: 43,
      representation: 50,
      toCheck: { amount: 54, count: 3 },
      withoutVat: 1,
      foreign: 1,
    });
  });

  it("shows VAT as printed only outside Sweden, or for a Swedish company not in kronor", () => {
    const fr = vatFor(
      [row({ currency: "EUR", total: 120, tax_amount: 20, tax_rate: 20, category: "client_entertainment" })],
      "EUR",
      "FR"
    );
    expect(fr).toMatchObject({ mode: "other", total: 20, swedish: null, representation: null, toCheck: null });
    expect(vatFor([row({ tax_amount: 25, tax_rate: 25 })], "SEK", "FR").mode).toBe("other");
  });
});

describe("buildAnalytics", () => {
  const today = "2026-11-11";

  it("totals the period, counts receipts to confirm and lists what isn't in the total", () => {
    const rows = [
      row({ receipt_date: "2026-11-02", total: 100 }),
      row({ receipt_date: "2026-11-03", total: 50, status: "pending_review" }),
      row({ receipt_date: "2026-11-04", total: null, status: "pending_review" }),
      row({ receipt_date: "2026-11-04", currency: "USD", total: 10 }),
      row({ receipt_date: null, total: 999 }),
      row({ receipt_date: "2026-10-15", total: 70 }),
    ];
    const a = buildAnalytics(rows, "SEK", month("2026-11"), today);
    expect(a.total).toEqual({
      amount: 150,
      estimate: false,
      count: 4,
      toConfirm: 2,
      unconverted: [{ amount: 10, currency: "USD", estimate: false }],
    });
    expect(a.quality).toEqual({ missingAmount: 1, toComplete: 1, unconverted: 1, undated: 1 });
    expect(a.period.current).toBe(true);
    expect(a.buckets).toHaveLength(30);
    expect(a.buckets[1]).toMatchObject({ from: "2026-11-02", amount: 100, count: 1 });
    // The user's first receipt is in October: no comparison with October.
    expect(a.firstDay).toBe("2026-10-15");
    expect(a.compare).toEqual({ previous: null, lastYear: null });
    expect(a.previousBuckets).toEqual([]);
  });

  it("compares with the month before and last year once the user had receipts then", () => {
    const rows = [
      row({ receipt_date: "2025-09-20", total: 10 }),
      row({ receipt_date: "2025-11-20", total: 40 }),
      row({ receipt_date: "2026-10-01", total: 200, category: "travel" }),
      row({ receipt_date: "2026-11-01", total: 300, category: "travel" }),
      row({ receipt_date: "2026-11-02", total: 100 }),
    ];
    const a = buildAnalytics(rows, "SEK", month("2026-11"), today);
    expect(a.compare).toEqual({ previous: 200, lastYear: 40 });
    expect(a.previousBuckets).toHaveLength(31);
    expect(a.previousBuckets[0]).toBe(200);
    expect(a.categories).toEqual([
      { category: "travel", amount: 300, count: 1, share: 0.75, previous: 200 },
      { category: "meals", amount: 100, count: 1, share: 0.25, previous: 0 },
    ]);
  });

  it("ranks merchants under one name and their most used spelling", () => {
    const rows = [
      row({ merchant_name: "ICA Kvantum", total: 100 }),
      row({ merchant_name: "ICA KVANTUM AB", total: 50 }),
      row({ merchant_name: "ICA Kvantum", total: 25 }),
      row({ merchant_name: "Clas Ohlson", total: 300 }),
    ];
    const a = buildAnalytics(rows, "SEK", month("2026-11"), today);
    expect(a.merchants.map((m) => [m.name, m.amount, m.count])).toEqual([
      ["Clas Ohlson", 300, 1],
      ["ICA Kvantum", 175, 3],
    ]);
  });

  it("finds a monthly subscription, a category spike, a new merchant and duplicates", () => {
    const rows = [
      // Three months of history.
      ...["2026-08", "2026-09", "2026-10"].flatMap((m) => [
        row({ receipt_date: `${m}-05`, merchant_name: "Figma", category: "software", total: 150 }),
        row({ receipt_date: `${m}-10`, merchant_name: "SJ", category: "travel", total: 400 }),
      ]),
      row({ receipt_date: "2026-11-05", merchant_name: "Figma", category: "software", total: 155 }),
      row({ receipt_date: "2026-11-06", merchant_name: "SJ", category: "travel", total: 1400 }),
      row({ receipt_date: "2026-11-07", merchant_name: "Elgiganten", category: "office_supplies", total: 900 }),
      row({ receipt_date: "2026-11-08", merchant_name: "Pressbyrån", total: 40, notes: DUPLICATE_NOTE }),
    ];
    const a = buildAnalytics(rows, "SEK", month("2026-11"), today);
    const kinds = a.insights.map((i) => i.kind);
    expect(kinds).toEqual(["duplicates", "category_up", "recurring"]);
    expect(a.insights[1]).toMatchObject({ kind: "category_up", category: "travel", amount: 1400, baseline: 400, pct: 250 });
    expect(a.insights[2]).toMatchObject({ kind: "recurring", name: "Figma", months: 4 });
  });

  it("names a new merchant when the user has history", () => {
    const rows = [
      row({ receipt_date: "2026-10-05", merchant_name: "ICA", total: 100 }),
      row({ receipt_date: "2026-11-05", merchant_name: "ICA", total: 100 }),
      row({ receipt_date: "2026-11-07", merchant_name: "Elgiganten", category: "office_supplies", total: 900 }),
    ];
    const a = buildAnalytics(rows, "SEK", month("2026-11"), today);
    expect(a.insights.find((i) => i.kind === "new_merchant")).toMatchObject({ name: "Elgiganten", amount: 900 });
  });

  it("stays quiet for a user's first period", () => {
    const rows = [row({ receipt_date: "2026-11-02", total: 100 }), row({ receipt_date: "2026-11-03", total: 120 })];
    expect(buildAnalytics(rows, "SEK", month("2026-11"), today).insights).toEqual([]);
  });
});

describe("olderSummary", () => {
  it("counts and sums only receipts outside the home list, by printed month", () => {
    const listed = row({ receipt_date: "2026-11-01", total: 1000 });
    const rows = [
      listed,
      row({ purchased_at: "2026-10-01T09:30:00.000Z", receipt_date: null, total: 100 }),
      row({ receipt_date: "2026-10-12", total: 50, status: "pending_review" }),
      row({ receipt_date: null, total: 7 }),
      row({ receipt_date: "2026-10-13", currency: "EUR", total: 3 }),
    ];
    const s = olderSummary(rows, new Set([listed.id]), "SEK");
    expect(s.count).toBe(4);
    expect(s.verified).toBe(3);
    expect(s.toConfirm).toBe(1);
    expect(s.months["2026-10"]).toEqual([
      { amount: 150, currency: "SEK", estimate: false },
      { amount: 3, currency: "EUR", estimate: false },
    ]);
    expect(s.months["2026-09"]).toBeUndefined();
    expect(s.all[0]).toEqual({ amount: 157, currency: "SEK", estimate: false });
  });
});

describe("representation insight", () => {
  it("matches the VAT block and is for Swedish companies only", () => {
    const rows = [
      row({ receipt_date: "2026-11-02", category: "client_entertainment", total: 250, tax_amount: 50, tax_rate: 25 }),
      row({ receipt_date: "2026-11-03", category: "client_entertainment", total: 125, tax_amount: 25, tax_rate: 25, status: "pending_review" }),
    ];
    const se = buildAnalytics(rows, "SEK", month("2026-11"), "2026-11-11", "SE");
    expect(se.insights.find((i) => i.kind === "representation")).toMatchObject({ vat: 50, amount: 250 });
    expect(se.vat.representation).toBe(50);
    const fr = buildAnalytics(
      rows.map((r) => ({ ...r, currency: "EUR" })),
      "EUR",
      month("2026-11"),
      "2026-11-11",
      "FR"
    );
    expect(fr.insights.find((i) => i.kind === "representation")).toBeUndefined();
  });
});

describe("needsVatCheck", () => {
  it("picks exactly the receipts behind \"to check\"", () => {
    expect(needsVatCheck(row({ tax_amount: 25, tax_rate: 25 }), "SEK", "SE")).toBe(false);
    expect(needsVatCheck(row({ tax_amount: 25, tax_rate: 25, status: "pending_review" }), "SEK", "SE")).toBe(true);
    expect(needsVatCheck(row({ tax_amount: 20, tax_rate: 20 }), "SEK", "SE")).toBe(true);
    expect(needsVatCheck(row({ tax_amount: 9 }), "SEK", "SE")).toBe(true);
    expect(needsVatCheck(row({}), "SEK", "SE")).toBe(false);
    expect(needsVatCheck(row({ currency: "EUR", tax_amount: 2 }), "SEK", "SE")).toBe(false);
    expect(needsVatCheck(row({ tax_amount: 20, tax_rate: 20 }), "EUR", "FR")).toBe(false);
  });
});
