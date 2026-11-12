// Everything the Insights screen shows for one period, from the user's
// converted receipt rows. Pure: the loader (./load.ts) reads and converts,
// this only adds up, so every number is tested in isolation.

import type { AnalyticsCategory, AnalyticsMerchant, MobileAnalytics, OlderSummary } from "@/lib/mobile/types";
import { missingRequiredFields } from "@/lib/receipts/status";
import type { ReceiptCategory } from "@/lib/types";
import { insightsFor, type DatedRow } from "./insights";
import { merchantKey } from "./merchants";
import { contribution, purchaseDay, round2, Sum, type AnalyticsRow } from "./money";
import { bucketIndex, bucketsFor, type ResolvedPeriod } from "./periods";
import { vatFor } from "./vat";

export type ReadyAnalytics = Extract<MobileAnalytics, { state: "ready" }>;

/** Top merchants shown. */
export const MAX_MERCHANTS = 8;

const within = (day: string, r: { from: string; to: string }) => day >= r.from && day <= r.to;

export function buildAnalytics(
  rows: AnalyticsRow[],
  home: string,
  period: ResolvedPeriod,
  today: string,
  country = "SE"
): ReadyAnalytics {
  const dated: DatedRow[] = [];
  let undated = 0;
  let firstDay: string | null = null;
  for (const row of rows) {
    const day = purchaseDay(row);
    if (!day) {
      undated += 1;
      continue;
    }
    if (!firstDay || day < firstDay) firstDay = day;
    dated.push({ row, day, merchant: merchantKey(row.merchant_name) });
  }

  const inPeriod = dated.filter((d) => within(d.day, period));
  const total = new Sum();
  let toConfirm = 0;
  let toComplete = 0;
  for (const d of inPeriod) {
    total.add(contribution(d.row, home));
    if (d.row.status === "pending_review") {
      toConfirm += 1;
      if (missingRequiredFields(d.row).length > 0) toComplete += 1;
    }
  }

  // A comparison only when the user already had receipts then: a period
  // before their first receipt would read as "+100%".
  const comparable = (range: { from: string }) => firstDay != null && firstDay <= range.from;
  const sumOf = (range: { from: string; to: string }) => {
    const s = new Sum();
    for (const d of dated) if (within(d.day, range)) s.add(contribution(d.row, home));
    return round2(s.amount);
  };
  const hasPrevious = comparable(period.previous);
  const compare = {
    previous: hasPrevious ? sumOf(period.previous) : null,
    lastYear: comparable(period.lastYear) ? sumOf(period.lastYear) : null,
  };

  const bucketRanges = bucketsFor(period, period.granularity);
  const buckets = bucketRanges.map((b) => ({ ...b, amount: 0, count: 0 }));
  for (const d of inPeriod) {
    const i = bucketIndex(bucketRanges, d.day);
    if (i < 0) continue;
    buckets[i].count += 1;
    const c = contribution(d.row, home);
    if (c.kind === "home") buckets[i].amount += c.amount;
  }
  for (const b of buckets) b.amount = round2(b.amount);

  let previousBuckets: number[] = [];
  if (hasPrevious) {
    const prevRanges = bucketsFor(period.previous, period.granularity);
    previousBuckets = prevRanges.map(() => 0);
    for (const d of dated) {
      if (!within(d.day, period.previous)) continue;
      const i = bucketIndex(prevRanges, d.day);
      const c = contribution(d.row, home);
      if (i >= 0 && c.kind === "home") previousBuckets[i] += c.amount;
    }
    previousBuckets = previousBuckets.map(round2);
  }

  const totalAmount = round2(total.amount);

  // Categories
  const byCategory = new Map<ReceiptCategory, { amount: number; count: number }>();
  for (const d of inPeriod) {
    const acc = byCategory.get(d.row.category) ?? { amount: 0, count: 0 };
    const c = contribution(d.row, home);
    if (c.kind === "home") acc.amount += c.amount;
    acc.count += 1;
    byCategory.set(d.row.category, acc);
  }
  const prevByCategory = new Map<ReceiptCategory, number>();
  if (hasPrevious) {
    for (const d of dated) {
      if (!within(d.day, period.previous)) continue;
      const c = contribution(d.row, home);
      if (c.kind === "home") prevByCategory.set(d.row.category, (prevByCategory.get(d.row.category) ?? 0) + c.amount);
    }
  }
  const categories: AnalyticsCategory[] = [...byCategory]
    .map(([category, v]) => ({
      category,
      amount: round2(v.amount),
      count: v.count,
      share: totalAmount > 0 ? Math.round((v.amount / totalAmount) * 1000) / 1000 : 0,
      previous: hasPrevious ? round2(prevByCategory.get(category) ?? 0) : null,
    }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count);

  // Merchants
  const byMerchant = new Map<string, { amount: number; count: number; spellings: Map<string, number> }>();
  for (const d of inPeriod) {
    if (!d.merchant) continue;
    const acc = byMerchant.get(d.merchant) ?? { amount: 0, count: 0, spellings: new Map() };
    const c = contribution(d.row, home);
    if (c.kind === "home") acc.amount += c.amount;
    acc.count += 1;
    const name = (d.row.merchant_name ?? "").trim();
    acc.spellings.set(name, (acc.spellings.get(name) ?? 0) + 1);
    byMerchant.set(d.merchant, acc);
  }
  const prevByMerchant = new Map<string, number>();
  if (hasPrevious) {
    for (const d of dated) {
      if (!d.merchant || !within(d.day, period.previous)) continue;
      const c = contribution(d.row, home);
      if (c.kind === "home") prevByMerchant.set(d.merchant, (prevByMerchant.get(d.merchant) ?? 0) + c.amount);
    }
  }
  const merchants: AnalyticsMerchant[] = [...byMerchant]
    .filter(([, v]) => v.amount > 0)
    .map(([key, v]) => ({
      key,
      // The spelling used most often.
      name: [...v.spellings].sort((a, b) => b[1] - a[1])[0][0] || key,
      amount: round2(v.amount),
      count: v.count,
      previous: hasPrevious ? round2(prevByMerchant.get(key) ?? 0) : null,
    }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count)
    .slice(0, MAX_MERCHANTS);

  const unconverted = total.unconverted;

  return {
    state: "ready",
    currency: home,
    period: {
      kind: period.kind,
      key: period.key,
      from: period.from,
      to: period.to,
      previous: period.previous,
      lastYear: period.lastYear,
      current: within(today, period),
    },
    today,
    firstDay,
    total: {
      amount: totalAmount,
      estimate: total.estimate,
      count: total.count,
      toConfirm,
      unconverted,
    },
    compare,
    granularity: period.granularity,
    buckets,
    previousBuckets,
    categories,
    merchants,
    vat: vatFor(
      inPeriod.map((d) => d.row),
      home,
      country
    ),
    insights: insightsFor({ all: dated, inPeriod, period, home, country, total: totalAmount, firstDay }),
    quality: {
      missingAmount: total.missingAmount,
      toComplete,
      unconverted: inPeriod.filter((d) => contribution(d.row, home).kind === "foreign").length,
      undated,
    },
  };
}

/**
 * Counts and totals of the receipts that are not in the home list (the
 * newest 50), so the screens can add their own list to it.
 */
export function olderSummary(rows: AnalyticsRow[], listedIds: Set<string>, home: string): OlderSummary {
  const all = new Sum();
  const months = new Map<string, Sum>();
  let count = 0;
  let verified = 0;
  let toConfirm = 0;
  for (const r of rows) {
    if (listedIds.has(r.id)) continue;
    count += 1;
    if (r.status === "verified") verified += 1;
    else toConfirm += 1;
    const c = contribution(r, home);
    all.add(c);
    const day = purchaseDay(r);
    if (day) {
      const key = day.slice(0, 7);
      const s = months.get(key) ?? new Sum();
      s.add(c);
      months.set(key, s);
    }
  }
  return {
    count,
    verified,
    toConfirm,
    months: Object.fromEntries([...months].map(([k, s]) => [k, s.lines(home)])),
    all: all.lines(home),
  };
}
