// The Insights tab's own logic: which period is shown, moving between
// periods, labels, and the text of each finding. Pure (no React Native),
// so it is tested. The numbers themselves come from the server
// (GET /api/mobile/analytics, src/lib/analytics/ on the website).

import type {
  AnalyticsBucket,
  AnalyticsGranularity,
  AnalyticsInsight,
  MobileAnalytics,
} from "@/lib/mobile/types";
import type { ReceiptCategory } from "@/lib/types";
import { fill, type Locale } from "../i18n/core";
import type { Strings } from "../i18n/en";
import { formatMoney } from "./format";

export type ReadyAnalytics = Extract<MobileAnalytics, { state: "ready" }>;

/** What the screen asks for. Without an anchor: the period that holds today. */
export type PeriodQuery =
  | { kind: "month" | "quarter" | "year"; anchor?: string }
  | { kind: "custom"; from: string; to: string };

export function periodQueryString(q: PeriodQuery): string {
  const p = new URLSearchParams({ period: q.kind });
  if (q.kind === "custom") {
    p.set("from", q.from);
    p.set("to", q.to);
  } else if (q.anchor) {
    p.set("anchor", q.anchor);
  }
  return p.toString();
}

/** The cache key of a period: "month:now", "quarter:2026-Q3", "custom:2026-01-01_2026-02-01". */
export function periodCacheKey(q: PeriodQuery): string {
  if (q.kind === "custom") return `custom:${q.from}_${q.to}`;
  return `${q.kind}:${q.anchor ?? "now"}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The period `by` steps before (-1) or after (+1) the one shown, or null
 * when it would start after today (the future has no receipts).
 */
export function shiftPeriod(a: ReadyAnalytics, by: -1 | 1): PeriodQuery | null {
  const { kind, key, from, to } = a.period;
  let next: PeriodQuery;
  let nextFrom: string;
  if (kind === "month") {
    const [y, m] = key.split("-").map(Number);
    const i = y * 12 + (m - 1) + by;
    const anchor = `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
    next = { kind, anchor };
    nextFrom = `${anchor}-01`;
  } else if (kind === "quarter") {
    const [y, q] = key.split("-Q").map(Number);
    const i = y * 4 + (q - 1) + by;
    const ny = Math.floor(i / 4);
    const nq = (i % 4) + 1;
    next = { kind, anchor: `${ny}-Q${nq}` };
    nextFrom = `${ny}-${pad((nq - 1) * 3 + 1)}-01`;
  } else if (kind === "year") {
    const y = Number(key) + by;
    next = { kind, anchor: String(y) };
    nextFrom = `${y}-01-01`;
  } else {
    const days = daysBetween(from, to) + 1;
    const nFrom = addDays(from, by * days);
    const nTo = addDays(to, by * days);
    next = { kind, from: nFrom, to: nTo };
    nextFrom = nFrom;
  }
  return nextFrom > a.today ? null : next;
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const INTL_LOCALE = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" } as const;

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function fmt(day: string, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: "UTC", ...options }).format(asDate(day));
}

/** "November 2026", "Q4 2026", "2026", "3 Mar – 19 Apr 2026". */
export function periodTitle(p: Pick<ReadyAnalytics["period"], "kind" | "key" | "from" | "to">, locale: Locale, s: Strings): string {
  switch (p.kind) {
    case "month":
      return capital(fmt(p.from, locale, { month: "long", year: "numeric" }));
    case "quarter": {
      const [y, q] = p.key.split("-Q");
      return fill(s.insights.quarterLabel, { q, year: y });
    }
    case "year":
      return p.key;
    case "custom":
      return rangeLabel(p.from, p.to, locale, s);
  }
}

/** A range in words: "3 – 19 Mar 2026", "3 Mar – 19 Apr 2026", "3 Dec 2025 – 19 Jan 2026". */
export function rangeLabel(from: string, to: string, locale: Locale, s: Strings): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const left = fmt(from, locale, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  const right = fmt(to, locale, { day: "numeric", month: "short", year: "numeric" });
  return fill(s.insights.rangeLabel, { from: left, to: right });
}

/** The previous period in short words, for "vs October". */
export function previousLabel(a: ReadyAnalytics, locale: Locale, s: Strings): string {
  const prev = a.period.previous;
  switch (a.period.kind) {
    case "month":
      return capital(fmt(prev.from, locale, prev.from.slice(0, 4) === a.period.from.slice(0, 4) ? { month: "long" } : { month: "short", year: "numeric" }));
    case "quarter": {
      const q = Math.floor((Number(prev.from.slice(5, 7)) - 1) / 3) + 1;
      return fill(s.insights.quarterLabel, { q: String(q), year: prev.from.slice(0, 4) });
    }
    case "year":
      return prev.from.slice(0, 4);
    case "custom":
      return s.insights.periodBefore;
  }
}

/** "+12 %", "−8 %" in the app's language, or null when there is nothing to compare. */
export function changeText(current: number, previous: number | null, locale: Locale): string | null {
  if (previous == null || previous <= 0) return null;
  const change = current / previous - 1;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "percent",
    maximumFractionDigits: Math.abs(change) < 0.1 ? 1 : 0,
    signDisplay: "exceptZero",
  }).format(change);
}

/** "42 %" of a share between 0 and 1. */
export function shareText(share: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "percent", maximumFractionDigits: 0 }).format(share);
}

/** Running totals, for the month's pace line. */
export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => {
    sum += v;
    return Math.round(sum * 100) / 100;
  });
}

/** A bar's name under the chart and for VoiceOver: "12", "w 45"/"5 Oct", "Nov". */
export function bucketLabel(b: Pick<AnalyticsBucket, "from">, g: AnalyticsGranularity, locale: Locale, long = false): string {
  if (g === "day") return long ? fmt(b.from, locale, { day: "numeric", month: "long" }) : String(Number(b.from.slice(8, 10)));
  if (g === "week") return fmt(b.from, locale, long ? { day: "numeric", month: "long" } : { day: "numeric", month: "short" });
  return capital(fmt(b.from, locale, long ? { month: "long", year: "numeric" } : { month: "short" }));
}

/** Index of today's bucket in the shown period, or -1. */
export function todayIndex(a: ReadyAnalytics): number {
  if (!a.period.current) return -1;
  return a.buckets.findIndex((b) => a.today >= b.from && a.today <= b.to);
}

/** "1 receipt" / "3 receipts" from a pair of strings. */
export function plural(count: number, one: string, other: string): string {
  return fill(count === 1 ? one : other, { count });
}

export type InsightText = { title: string; body: string };

/** The words of a finding, in the app's language. */
export function insightText(i: AnalyticsInsight, currency: string, locale: Locale, s: Strings): InsightText {
  const money = (n: number) => formatMoney(n, currency, locale);
  const t = s.insights.findings;
  switch (i.kind) {
    case "duplicates":
      return { title: t.duplicatesTitle, body: plural(i.count, t.duplicatesOne, t.duplicatesOther) };
    case "category_up":
      return {
        title: fill(t.categoryUpTitle, { category: s.categories[i.category as ReceiptCategory], pct: `${i.pct} %` }),
        body: fill(t.categoryUpBody, { amount: money(i.amount), baseline: money(i.baseline) }),
      };
    case "recurring":
      return {
        title: fill(t.recurringTitle, { name: i.name }),
        body: fill(t.recurringBody, { amount: money(i.amount), months: i.months }),
      };
    case "new_merchant":
      return { title: fill(t.newMerchantTitle, { name: i.name }), body: fill(t.newMerchantBody, { amount: money(i.amount) }) };
    case "largest":
      return {
        title: t.largestTitle,
        body: fill(t.largestBody, { name: i.name || "—", amount: money(i.amount), share: shareText(i.share, locale) }),
      };
    case "representation":
      return {
        title: t.representationTitle,
        body: fill(t.representationBody, { vat: money(i.vat), amount: money(i.amount) }),
      };
  }
}

/** The receipts behind a finding, as a drill-down query parameter. */
export function insightFilter(i: AnalyticsInsight): Record<string, string> | null {
  switch (i.kind) {
    case "category_up":
      return { category: i.category };
    case "recurring":
    case "new_merchant":
      return { merchant: i.merchant };
    case "duplicates":
    case "largest":
    case "representation":
      return i.ids.length > 0 ? { ids: i.ids.join(",") } : null;
  }
}

/** Order of the categories' colours: the merchant palette (src/lib/merchant.ts), never new hues. */
const CATEGORY_COLORS: Record<ReceiptCategory, string> = {
  travel: "#3B5B8C",
  transport: "#2F6B7A",
  meals: "#8C6320",
  accommodation: "#6B4E8C",
  software: "#1A7F52",
  office_supplies: "#303568",
  client_entertainment: "#A0405A",
  other: "#5A5F7A",
};

export function categoryColor(c: ReceiptCategory): string {
  return CATEGORY_COLORS[c] ?? CATEGORY_COLORS.other;
}
