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
import { MERCHANT_PALETTE } from "./merchant";

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
export const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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

/** A VAT rate or a percentage given in percent points (25 → "25 %"), in the app's language. */
export function percentText(points: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "percent", maximumFractionDigits: 1 }).format(points / 100);
}

/** A piece of a sentence: words in Manrope, amounts in Geist Mono (DESIGN.md). */
export type Part = { text: string; money?: boolean };

/** fill() into parts, keeping each amount its own part. */
export function fillParts(template: string, words: Record<string, string | number>, amounts: Record<string, string> = {}): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const key = m[1];
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: template.slice(last, at) });
    if (key in amounts) parts.push({ text: amounts[key], money: true });
    else parts.push({ text: key in words ? String(words[key]) : m[0] });
    last = at + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  // Neighbouring words merge, so a screen reader reads one sentence.
  return parts.reduce<Part[]>((out, p) => {
    const prev = out[out.length - 1];
    if (prev && !prev.money && !p.money) prev.text += p.text;
    else out.push({ ...p });
    return out;
  }, []);
}

export const partsText = (parts: Part[]) => parts.map((p) => p.text).join("");

/**
 * A bar's name under the chart and for VoiceOver: "12", "1–7" (a month's
 * week), "5 Oct" (a quarter's week), "Nov".
 */
export function bucketLabel(
  b: Pick<AnalyticsBucket, "from" | "to">,
  g: AnalyticsGranularity,
  locale: Locale,
  long = false,
  // The bars are a month's 7-day blocks: name them by their days. A Monday
  // week (quarter, chosen dates) keeps its month even inside one month.
  monthBlocks = false,
): string {
  if (g === "day") return long ? fmt(b.from, locale, { day: "numeric", month: "long" }) : String(Number(b.from.slice(8, 10)));
  if (g === "week" && monthBlocks) {
    const days = b.from === b.to ? String(Number(b.from.slice(8, 10))) : `${Number(b.from.slice(8, 10))}–${Number(b.to.slice(8, 10))}`;
    return long ? `${days} ${fmt(b.from, locale, { month: "long" })}` : days;
  }
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

export type InsightText = { title: string; body: Part[] };

/** The words of a finding, in the app's language; amounts as their own parts. */
export function insightText(i: AnalyticsInsight, currency: string, locale: Locale, s: Strings): InsightText {
  const money = (n: number) => formatMoney(n, currency, locale);
  const t = s.insights.findings;
  switch (i.kind) {
    case "duplicates":
      return { title: t.duplicatesTitle, body: [{ text: plural(i.count, t.duplicatesOne, t.duplicatesOther) }] };
    case "category_up":
      return {
        title: fill(t.categoryUpTitle, { category: s.categories[i.category as ReceiptCategory], pct: percentText(i.pct, locale) }),
        body: fillParts(t.categoryUpBody, {}, { amount: money(i.amount), baseline: money(i.baseline) }),
      };
    case "recurring":
      return {
        title: fill(t.recurringTitle, { name: i.name }),
        body: fillParts(t.recurringBody, { months: i.months }, { amount: money(i.amount) }),
      };
    case "new_merchant":
      return {
        title: fill(t.newMerchantTitle, { name: i.name }),
        body: fillParts(t.newMerchantBody, {}, { amount: money(i.amount) }),
      };
    case "largest":
      return {
        title: t.largestTitle,
        body: fillParts(t.largestBody, { name: i.name || "—", share: shareText(i.share, locale) }, { amount: money(i.amount) }),
      };
    case "representation":
      return {
        title: t.representationTitle,
        body: fillParts(t.representationBody, {}, { vat: money(i.vat), amount: money(i.amount) }),
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

/**
 * One colour per category, from the merchant palette (src/lib/merchant.ts)
 * without its action green (the screen's one green is the chart's) and its
 * honey (it means "needs you"); "other" takes --ink-faint, the neutral.
 * On the dark palette the same hues, lightened to at least 5.5:1 on the dark
 * card (the light ones are 1.5–2.4:1 there): DESIGN.md "Dark mode".
 */
const CATEGORY_COLORS: Record<ReceiptCategory, string> = {
  travel: MERCHANT_PALETTE[2],
  transport: MERCHANT_PALETTE[5],
  meals: MERCHANT_PALETTE[4],
  accommodation: MERCHANT_PALETTE[3],
  software: MERCHANT_PALETTE[1],
  office_supplies: MERCHANT_PALETTE[8],
  client_entertainment: MERCHANT_PALETTE[7],
  other: "#9CA0B8",
};

const CATEGORY_COLORS_DARK: Record<ReceiptCategory, string> = {
  travel: "#7D9CCB",
  transport: "#6AAAB8",
  meals: "#C98473",
  accommodation: "#A78BC9",
  software: "#8C92D6",
  office_supplies: "#A4A8C0",
  client_entertainment: "#D67A92",
  other: "#6A6E88",
};

export function categoryColor(c: ReceiptCategory, scheme: "light" | "dark" = "light"): string {
  const table = scheme === "dark" ? CATEGORY_COLORS_DARK : CATEGORY_COLORS;
  return table[c] ?? table.other;
}
