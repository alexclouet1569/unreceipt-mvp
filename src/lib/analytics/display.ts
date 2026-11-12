// The website Insights page's own display logic: moving between periods,
// labels, change and share texts, and the words of each finding. Pure and
// client-safe (English, like the rest of the product site). The iPhone app
// has its own copy in its three languages (mobile/src/lib/insights.ts); the
// numbers come from the same engine (./aggregate.ts).

import type {
  AnalyticsBucket,
  AnalyticsGranularity,
  AnalyticsInsight,
  AnalyticsPeriodKind,
} from "@/lib/mobile/types";
import { CATEGORY_CONFIG, formatAmount, type CategoryKey } from "@/lib/receipt-format";
import type { ReceiptCategory } from "@/lib/types";
import type { ReadyAnalytics } from "./aggregate";

export type { ReadyAnalytics };

/** What the page shows. Without an anchor: the period that holds today. */
export type PeriodQuery =
  | { kind: "month" | "quarter" | "year"; anchor?: string }
  | { kind: "custom"; from: string; to: string };

/** The page's query string for a period (also the API's). */
export function periodSearch(q: PeriodQuery): string {
  const p = new URLSearchParams({ period: q.kind });
  if (q.kind === "custom") {
    p.set("from", q.from);
    p.set("to", q.to);
  } else if (q.anchor) {
    p.set("anchor", q.anchor);
  }
  return p.toString();
}

/** The query of the period shown, for drill-down links. */
export function shownPeriod(a: ReadyAnalytics): PeriodQuery {
  return a.period.kind === "custom"
    ? { kind: "custom", from: a.period.from, to: a.period.to }
    : { kind: a.period.kind, anchor: a.period.key };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

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
    next = { kind, from: nFrom, to: addDays(to, by * days) };
    nextFrom = nFrom;
  }
  return nextFrom > a.today ? null : next;
}

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
function fmt(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(asDate(day));
}

/** "November 2026", "Q4 2026", "2026", "3 Mar – 19 Apr 2026". */
export function periodTitle(p: { kind: AnalyticsPeriodKind; key: string; from: string; to: string }): string {
  switch (p.kind) {
    case "month":
      return fmt(p.from, { month: "long", year: "numeric" });
    case "quarter": {
      const [y, q] = p.key.split("-Q");
      return `Q${q} ${y}`;
    }
    case "year":
      return p.key;
    case "custom":
      return rangeLabel(p.from, p.to);
  }
}

/** "3 – 19 Mar 2026" style ranges: "3 Mar – 19 Apr 2026", "3 Dec 2025 – 19 Jan 2026". */
export function rangeLabel(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const left = fmt(from, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  return `${left} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** The previous period in short words, for "vs October". */
export function previousLabel(a: ReadyAnalytics): string {
  const prev = a.period.previous;
  switch (a.period.kind) {
    case "month":
      return fmt(prev.from, prev.from.slice(0, 4) === a.period.from.slice(0, 4) ? { month: "long" } : { month: "short", year: "numeric" });
    case "quarter":
      return `Q${Math.floor((Number(prev.from.slice(5, 7)) - 1) / 3) + 1} ${prev.from.slice(0, 4)}`;
    case "year":
      return prev.from.slice(0, 4);
    case "custom":
      return "the period before";
  }
}

/** "+12%", "−8%", or null when there is nothing to compare with. */
export function changeText(current: number, previous: number | null): string | null {
  if (previous == null || previous <= 0) return null;
  const change = current / previous - 1;
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: Math.abs(change) < 0.1 ? 1 : 0,
    signDisplay: "exceptZero",
  }).format(change);
}

/** "42%" of a share between 0 and 1. */
export function shareText(share: number): string {
  return new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 }).format(share);
}

/** A rate in percent points (25 → "25%"). */
export function percentText(points: number): string {
  return new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(points / 100);
}

/** A month's name ("September", "September 2025" in another year than `today`). */
export function monthName(day: string, today: string): string {
  return fmt(day, day.slice(0, 4) === today.slice(0, 4) ? { month: "long" } : { month: "long", year: "numeric" });
}

/** A piece of a sentence: words in Manrope, amounts in Geist Mono (DESIGN.md). */
export type Part = { text: string; money?: boolean };

/** Fill a "{name}" template into parts, keeping each amount its own part. */
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
  return parts.reduce<Part[]>((out, p) => {
    const prev = out[out.length - 1];
    if (prev && !prev.money && !p.money) prev.text += p.text;
    else out.push({ ...p });
    return out;
  }, []);
}

export const partsText = (parts: Part[]) => parts.map((p) => p.text).join("");

/** Running totals, for the month's pace line. */
export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => {
    sum += v;
    return Math.round(sum * 100) / 100;
  });
}

/** A bar's name under the chart: "12", "5 Oct", "Nov"; long for the readout. */
export function bucketLabel(b: Pick<AnalyticsBucket, "from">, g: AnalyticsGranularity, long = false): string {
  if (g === "day") return long ? fmt(b.from, { day: "numeric", month: "long" }) : String(Number(b.from.slice(8, 10)));
  if (g === "week") return long ? `Week of ${fmt(b.from, { day: "numeric", month: "long" })}` : fmt(b.from, { day: "numeric", month: "short" });
  return fmt(b.from, long ? { month: "long", year: "numeric" } : { month: "short" });
}

/** Index of today's bar in the shown period, or -1. */
export function todayIndex(a: ReadyAnalytics): number {
  if (!a.period.current) return -1;
  return a.buckets.findIndex((b) => a.today >= b.from && a.today <= b.to);
}

export function plural(count: number, one: string, other: string): string {
  return (count === 1 ? one : other).replace("{count}", String(count));
}

export const money = (amount: number, currency: string) => formatAmount(amount, currency);

export function categoryLabel(c: ReceiptCategory): string {
  return CATEGORY_CONFIG[c as CategoryKey]?.label ?? "Other";
}

/**
 * A category's colour: a CSS variable from globals.css (the merchant
 * palette without its action green and honey, DESIGN.md "Charts and
 * Insights"), so dark mode can change it in one place.
 */
export function categoryColor(c: ReceiptCategory): string {
  const known: ReceiptCategory[] = [
    "travel",
    "transport",
    "meals",
    "accommodation",
    "software",
    "office_supplies",
    "client_entertainment",
  ];
  return known.includes(c) ? `var(--category-${c.replace("_", "-")})` : "var(--category-other)";
}

export type InsightText = { title: string; body: Part[] };

/** The words of a finding; amounts as their own parts. Same wording as the iPhone app. */
export function insightText(i: AnalyticsInsight, currency: string): InsightText {
  const m = (n: number) => money(n, currency);
  switch (i.kind) {
    case "duplicates":
      return {
        title: "Possible duplicates",
        body: [
          {
            text: plural(
              i.count,
              "1 receipt looks like another one. Check it before your accountant books it twice.",
              "{count} receipts look like others. Check them before your accountant books them twice.",
            ),
          },
        ],
      };
    case "category_up":
      return {
        title: `${categoryLabel(i.category)} up ${percentText(i.pct)}`,
        body: fillParts("{amount} in this period, against about {baseline} usually.", {}, { amount: m(i.amount), baseline: m(i.baseline) }),
      };
    case "recurring":
      return {
        title: `${i.name} every month`,
        body: fillParts("About {amount} a month, in {months} of the last 4 months.", { months: i.months }, { amount: m(i.amount) }),
      };
    case "new_merchant":
      return {
        title: `New: ${i.name}`,
        body: fillParts("{amount} in this period, the first time you've paid them.", {}, { amount: m(i.amount) }),
      };
    case "largest":
      return {
        title: "Largest purchase",
        body: fillParts("{name}: {amount}, {share} of the period.", { name: i.name || "—", share: shareText(i.share) }, { amount: m(i.amount) }),
      };
    case "representation":
      return {
        title: "Client entertainment",
        body: fillParts(
          "{vat} VAT on {amount}. Special VAT rules apply: your accountant decides how much counts.",
          {},
          { vat: m(i.vat), amount: m(i.amount) },
        ),
      };
  }
}

/** The receipts behind a finding, as drill-down query parameters. */
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
