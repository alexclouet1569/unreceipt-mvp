// The periods the Insights screen looks at: a month, a quarter, a year or
// any from–to range, each with the period before it and the same period a
// year earlier. Pure: dates are plain calendar days ("YYYY-MM-DD"),
// inclusive, in Europe/Stockholm (see purchaseDay() in ./money.ts).

import type { AnalyticsGranularity, AnalyticsPeriodKind, AnalyticsRange } from "@/lib/mobile/types";

export type ResolvedPeriod = {
  kind: AnalyticsPeriodKind;
  /** "2026-11", "2026-Q4", "2026", or "2026-01-05_2026-03-02". */
  key: string;
  from: string;
  to: string;
  previous: AnalyticsRange;
  lastYear: AnalyticsRange;
  granularity: AnalyticsGranularity;
};

/** A custom range may cover at most this many days (two years). */
export const MAX_CUSTOM_DAYS = 731;

const DAY_MS = 86_400_000;

export function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** Days in a month; `m` is 1–12. */
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive number of days from `from` to `to`. */
export function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The same calendar day a year earlier; 29 February becomes the 28th. */
export function minusYear(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return ymd(y - 1, m, Math.min(d, daysIn(y - 1, m)));
}

function monthRange(y: number, m: number): AnalyticsRange {
  return { from: ymd(y, m, 1), to: ymd(y, m, daysIn(y, m)) };
}

function shiftMonth(y: number, m: number, by: number): [number, number] {
  const i = y * 12 + (m - 1) + by;
  return [Math.floor(i / 12), (i % 12) + 1];
}

/** Bars per day up to ~6 weeks, per week up to ~6 months, per month beyond. */
export function granularityFor(from: string, to: string): AnalyticsGranularity {
  const n = daySpan(from, to);
  if (n <= 45) return "day";
  if (n <= 190) return "week";
  return "month";
}

export type PeriodInput = {
  kind?: string | null;
  /** month: "2026-11"; quarter: "2026-Q4"; year: "2026". */
  anchor?: string | null;
  from?: string | null;
  to?: string | null;
};

/**
 * The period asked for, or null when the input is malformed. Without an
 * anchor, the period that contains `today`.
 */
export function resolvePeriod(input: PeriodInput, today: string): ResolvedPeriod | null {
  const kind = (input.kind ?? "month") as AnalyticsPeriodKind;
  const [ty, tm] = today.split("-").map(Number);
  const anchor = input.anchor ?? null;

  if (kind === "month") {
    let y = ty;
    let m = tm;
    if (anchor) {
      const hit = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(anchor);
      if (!hit) return null;
      y = Number(hit[1]);
      m = Number(hit[2]);
    }
    const range = monthRange(y, m);
    const [py, pm] = shiftMonth(y, m, -1);
    return {
      kind,
      key: `${y}-${pad(m)}`,
      ...range,
      previous: monthRange(py, pm),
      lastYear: monthRange(y - 1, m),
      granularity: "day",
    };
  }

  if (kind === "quarter") {
    let y = ty;
    let q = Math.floor((tm - 1) / 3) + 1;
    if (anchor) {
      const hit = /^(\d{4})-Q([1-4])$/.exec(anchor);
      if (!hit) return null;
      y = Number(hit[1]);
      q = Number(hit[2]);
    }
    const first = (q - 1) * 3 + 1;
    const range = { from: ymd(y, first, 1), to: ymd(y, first + 2, daysIn(y, first + 2)) };
    const [py, pm] = shiftMonth(y, first, -3);
    return {
      kind,
      key: `${y}-Q${q}`,
      ...range,
      previous: { from: ymd(py, pm, 1), to: ymd(py, pm + 2, daysIn(py, pm + 2)) },
      lastYear: { from: ymd(y - 1, first, 1), to: ymd(y - 1, first + 2, daysIn(y - 1, first + 2)) },
      granularity: "week",
    };
  }

  if (kind === "year") {
    let y = ty;
    if (anchor) {
      if (!/^\d{4}$/.test(anchor)) return null;
      y = Number(anchor);
    }
    return {
      kind,
      key: String(y),
      from: ymd(y, 1, 1),
      to: ymd(y, 12, 31),
      previous: { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) },
      lastYear: { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) },
      granularity: "month",
    };
  }

  if (kind === "custom") {
    const { from, to } = input;
    if (!isDay(from) || !isDay(to) || from > to) return null;
    const n = daySpan(from, to);
    if (n > MAX_CUSTOM_DAYS) return null;
    return {
      kind,
      key: `${from}_${to}`,
      from,
      to,
      // The same number of days right before.
      previous: { from: addDays(from, -n), to: addDays(from, -1) },
      lastYear: { from: minusYear(from), to: minusYear(to) },
      granularity: granularityFor(from, to),
    };
  }

  return null;
}

export type Bucket = { from: string; to: string };

/**
 * The bars of a range: days, Monday-to-Sunday weeks, or calendar months,
 * clipped to the range so the first and last bar may be partial.
 */
export function bucketsFor(range: AnalyticsRange, granularity: AnalyticsGranularity): Bucket[] {
  const out: Bucket[] = [];
  let cursor = range.from;
  let guard = 0;
  while (cursor <= range.to && guard++ < 1000) {
    let end: string;
    if (granularity === "day") {
      end = cursor;
    } else if (granularity === "week") {
      const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay(); // 0 = Sunday
      end = addDays(cursor, (7 - weekday) % 7);
    } else {
      const [y, m] = cursor.split("-").map(Number);
      end = ymd(y, m, daysIn(y, m));
    }
    if (end > range.to) end = range.to;
    out.push({ from: cursor, to: end });
    cursor = addDays(end, 1);
  }
  return out;
}

/** Index of the bucket holding `day`, or -1. Buckets are sorted and contiguous. */
export function bucketIndex(buckets: Bucket[], day: string): number {
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (day < buckets[mid].from) hi = mid - 1;
    else if (day > buckets[mid].to) lo = mid + 1;
    else return mid;
  }
  return -1;
}
