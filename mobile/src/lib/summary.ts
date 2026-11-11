// The header of the receipts list: a period's total in the company's
// currency, how many receipts it holds, and the category filter. Pure, so
// it's tested; the same rules as the website's dashboard
// (src/app/app/(authed)/dashboard.tsx: receiptMonthKey, sumByCurrency).

import type { MobileReceipt, MoneyLine, OlderSummary } from "@/lib/mobile/types";
import type { ReceiptCategory } from "@/lib/types";
import type { Locale } from "../i18n/core";
import { monthLabel, parseReceiptDate, shortMonthLabel } from "./format";

/** "2026-11", or "all". */
export type PeriodKey = string;

export const ALL_TIME = "all";

/** label: in the picker ("September 2025"); short: in the narrow box ("Sep 2025"). */
export type Period = { key: PeriodKey; label: string; short: string };

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * The month printed on the receipt. `date` is a plain date or the receipt's
 * own clock time written with a "Z" (not a real UTC instant), so it is read
 * as printed, never shifted into the phone's time zone: a receipt from
 * 23:15 on 31 December stays in December, as in the server's totals.
 */
export function receiptMonthKey(r: Pick<MobileReceipt, "date">): string | null {
  const m = r.date ? /^(\d{4})-(\d{2})/.exec(r.date) : null;
  if (m) return `${m[1]}-${m[2]}`;
  const d = parseReceiptDate(r.date);
  return d ? monthKey(d.getFullYear(), d.getMonth()) : null;
}

/**
 * This month first, then every month with a receipt, newest first, then all
 * time. `moreMonths`: months of receipts not in the list (the server's
 * summary of everything beyond the newest 50).
 */
export function periodsFor(
  receipts: Pick<MobileReceipt, "date">[],
  locale: Locale,
  allTimeLabel: string,
  now: Date = new Date(),
  moreMonths: string[] = [],
): Period[] {
  const keys = new Set<string>([monthKey(now.getFullYear(), now.getMonth())]);
  for (const k of moreMonths) if (/^\d{4}-\d{2}$/.test(k)) keys.add(k);
  for (const r of receipts) {
    const k = receiptMonthKey(r);
    if (k) keys.add(k);
  }
  const months = [...keys].sort().reverse().map((key) => {
    const [y, m] = key.split("-").map(Number);
    return { key, label: monthLabel(y, m - 1, locale, now), short: shortMonthLabel(y, m - 1, locale, now) };
  });
  return [...months, { key: ALL_TIME, label: allTimeLabel, short: allTimeLabel }];
}

export function inPeriod(receipts: MobileReceipt[], period: PeriodKey): MobileReceipt[] {
  return period === ALL_TIME ? receipts : receipts.filter((r) => receiptMonthKey(r) === period);
}

export type TotalLine = MoneyLine;

/**
 * Two lists of totals added up (the phone's own list and the server's sum
 * of everything older). The company's currency first; other zero lines dropped.
 */
export function mergeTotals(a: TotalLine[], b: TotalLine[], homeCurrency: string): TotalLine[] {
  const sums = new Map<string, TotalLine>();
  for (const l of [...a, ...b]) {
    const line = sums.get(l.currency) ?? { amount: 0, currency: l.currency, estimate: false };
    line.amount += l.amount;
    line.estimate = line.estimate || l.estimate;
    sums.set(l.currency, line);
  }
  if (!sums.has(homeCurrency)) sums.set(homeCurrency, { amount: 0, currency: homeCurrency, estimate: false });
  return [...sums.values()]
    .filter((l) => l.currency === homeCurrency || l.amount !== 0)
    .map((l) => ({ ...l, amount: Math.round(l.amount * 100) / 100 }))
    .sort((x, y) => (x.currency === homeCurrency ? -1 : y.currency === homeCurrency ? 1 : 0));
}

/** Counts for the stat boxes and the tab badge: the list plus everything older. */
export function overallCounts(
  receipts: Pick<MobileReceipt, "status">[],
  older: OlderSummary | undefined,
): { count: number; verified: number; toConfirm: number } {
  let verified = 0;
  for (const r of receipts) if (r.status === "verified") verified += 1;
  return {
    count: receipts.length + (older?.count ?? 0),
    verified: verified + (older?.verified ?? 0),
    toConfirm: receipts.length - verified + (older?.toConfirm ?? 0),
  };
}

/** The total of a period over the list and the older receipts. */
export function periodTotals(
  receipts: MobileReceipt[],
  older: OlderSummary | undefined,
  period: PeriodKey,
  homeCurrency: string,
): TotalLine[] {
  const own = totalsFor(inPeriod(receipts, period), homeCurrency);
  const rest = (period === ALL_TIME ? older?.all : older?.months[period]) ?? [];
  return mergeTotals(own, rest, homeCurrency);
}

/**
 * The total in the company's currency: a foreign receipt counts with its
 * converted amount. One not converted yet is listed apart, never added in
 * (DESIGN.md 2026-11-05). An ECB estimate in a sum marks it "≈".
 * The company's currency comes first.
 */
export function totalsFor(receipts: MobileReceipt[], homeCurrency: string, zeroHome = true): TotalLine[] {
  const sums = new Map<string, TotalLine>();
  for (const r of receipts) {
    const converted = r.homeTotal != null && r.homeCurrency != null;
    const amount = converted ? r.homeTotal : r.total;
    const currency = converted ? (r.homeCurrency as string) : r.currency;
    if (amount == null) continue;
    const line = sums.get(currency) ?? { amount: 0, currency, estimate: false };
    line.amount += amount;
    if (converted && r.fxSource === "ecb" && r.currency !== r.homeCurrency) line.estimate = true;
    sums.set(currency, line);
  }
  const lines = [...sums.values()].map((l) => ({ ...l, amount: Math.round(l.amount * 100) / 100 }));
  if (zeroHome && !lines.some((l) => l.currency === homeCurrency)) {
    lines.unshift({ amount: 0, currency: homeCurrency, estimate: false });
  }
  return lines.sort((a, b) => (a.currency === homeCurrency ? -1 : b.currency === homeCurrency ? 1 : 0));
}

export type CategoryCount = { key: ReceiptCategory; count: number };

/** Categories that have receipts, most used first (ties keep the server's order). */
export function categoryCounts(receipts: MobileReceipt[]): CategoryCount[] {
  const counts = new Map<ReceiptCategory, number>();
  for (const r of receipts) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** The chips above the list, as on the website: All, To confirm, or one category. */
export type ListFilter = "all" | "review" | ReceiptCategory;

/** The receipts a chip keeps. A chip with no receipt left falls back to All. */
export function applyFilter(
  receipts: MobileReceipt[],
  filter: ListFilter,
): { filter: ListFilter; receipts: MobileReceipt[] } {
  if (filter === "all") return { filter, receipts };
  const kept =
    filter === "review" ? receipts.filter((r) => r.status === "pending_review") : receipts.filter((r) => r.category === filter);
  return kept.length > 0 ? { filter, receipts: kept } : { filter: "all", receipts };
}

export type CategorySection = {
  key: string;
  category: ReceiptCategory;
  data: MobileReceipt[];
  /** The section's total in the company's currency (foreign amounts not converted yet apart). */
  totals: TotalLine[];
};

/** "By category": one section per category, most used first, each with its total (the website's view). */
export function categorySections(receipts: MobileReceipt[], homeCurrency: string): CategorySection[] {
  return categoryCounts(receipts).map(({ key }) => {
    const data = receipts.filter((r) => r.category === key);
    return { key: `c-${key}`, category: key, data, totals: totalsFor(data, homeCurrency, false) };
  });
}
