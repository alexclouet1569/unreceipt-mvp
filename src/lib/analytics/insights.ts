// Findings worth a line on the Insights screen. Pure and deterministic:
// each one is a rule over the numbers, never a guess, and carries the ids
// of the receipts behind it so a tap shows them. The text is written by
// each screen in its own language from `kind` and the numbers.

import { isPossibleDuplicate } from "@/lib/receipts/notes";
import type { AnalyticsInsight } from "@/lib/mobile/types";
import type { ReceiptCategory } from "@/lib/types";
import type { ResolvedPeriod } from "./periods";
import { contribution, round2, type AnalyticsRow } from "./money";
import { isSwedishVat, vatFor } from "./vat";

/** A row with its purchase day and merchant key worked out once. */
export type DatedRow = { row: AnalyticsRow; day: string; merchant: string | null };

export const MAX_INSIGHTS = 3;
/** At most this many receipt ids per insight. */
const MAX_IDS = 50;

/** "Well above usual": +30% and at least a tenth of the period's total. */
const SPIKE_RATIO = 1.3;
const SPIKE_MIN_SHARE = 0.1;
/** Recurring: in 3 of the last 4 months, each month within ±15% of the median. */
const RECURRING_MONTHS = 4;
const RECURRING_MIN = 3;
const RECURRING_TOLERANCE = 0.15;
/** A new merchant is worth a line from a tenth of the period's total. */
const NEW_MERCHANT_MIN_SHARE = 0.1;
/** The largest purchase is worth a line from 15% of the total, with 3+ receipts. */
const LARGEST_MIN_SHARE = 0.15;

type Ctx = {
  all: DatedRow[];
  inPeriod: DatedRow[];
  period: ResolvedPeriod;
  home: string;
  country: string;
  total: number;
  firstDay: string | null;
};

const amountOf = (r: AnalyticsRow, home: string) => {
  const c = contribution(r, home);
  return c.kind === "home" ? c.amount : 0;
};

const monthOf = (day: string) => day.slice(0, 7);

function shiftMonthKey(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sumIn(rows: DatedRow[], home: string, from: string, to: string, category?: ReceiptCategory): number {
  let sum = 0;
  for (const d of rows) {
    if (d.day < from || d.day > to) continue;
    if (category && d.row.category !== category) continue;
    sum += amountOf(d.row, home);
  }
  return sum;
}

function categoryUp(ctx: Ctx): AnalyticsInsight | null {
  const { period, all, inPeriod, home, total, firstDay } = ctx;
  if (!firstDay || total <= 0) return null;
  // The usual level: for a month, the average of the three months before
  // (as many as the user has fully had); otherwise the previous period.
  const baselines: Array<{ from: string; to: string }> = [];
  if (period.kind === "month") {
    for (let i = 1; i <= 3; i++) {
      const key = shiftMonthKey(period.key, -i);
      const [y, m] = key.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const range = { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
      if (firstDay > range.from) break;
      baselines.push(range);
    }
  } else if (firstDay <= period.previous.from) {
    baselines.push(period.previous);
  }
  if (baselines.length === 0) return null;

  const categories = new Set(inPeriod.map((d) => d.row.category));
  let best: AnalyticsInsight | null = null;
  let bestRise = 0;
  for (const category of categories) {
    const amount = sumIn(inPeriod, home, period.from, period.to, category);
    const baseline = baselines.reduce((s, b) => s + sumIn(all, home, b.from, b.to, category), 0) / baselines.length;
    if (baseline <= 0) continue;
    const rise = amount - baseline;
    if (amount < baseline * SPIKE_RATIO || rise < total * SPIKE_MIN_SHARE) continue;
    if (rise > bestRise) {
      bestRise = rise;
      best = {
        kind: "category_up",
        category,
        amount: round2(amount),
        baseline: round2(baseline),
        pct: Math.round((amount / baseline - 1) * 100),
      };
    }
  }
  return best;
}

function recurring(ctx: Ctx): AnalyticsInsight | null {
  const { period, all, inPeriod, home } = ctx;
  const lastMonth = monthOf(period.to);
  const months = Array.from({ length: RECURRING_MONTHS }, (_, i) => shiftMonthKey(lastMonth, -i));
  const window = new Set(months);
  const inPeriodKeys = new Set(inPeriod.map((d) => d.merchant).filter(Boolean));

  // merchant → month → amount
  const per = new Map<string, Map<string, number>>();
  const names = new Map<string, string>();
  for (const d of all) {
    if (!d.merchant || !inPeriodKeys.has(d.merchant) || !window.has(monthOf(d.day))) continue;
    const amount = amountOf(d.row, home);
    if (amount <= 0) continue;
    const m = per.get(d.merchant) ?? new Map<string, number>();
    m.set(monthOf(d.day), (m.get(monthOf(d.day)) ?? 0) + amount);
    per.set(d.merchant, m);
    names.set(d.merchant, d.row.merchant_name ?? d.merchant);
  }

  let best: AnalyticsInsight | null = null;
  for (const [merchant, byMonth] of per) {
    if (byMonth.size < RECURRING_MIN) continue;
    const amounts = [...byMonth.values()];
    const mid = median(amounts);
    if (mid <= 0 || amounts.some((a) => Math.abs(a - mid) > mid * RECURRING_TOLERANCE)) continue;
    if (best && best.kind === "recurring" && best.amount >= mid) continue;
    best = {
      kind: "recurring",
      merchant,
      name: names.get(merchant) ?? merchant,
      amount: round2(mid),
      months: byMonth.size,
      ids: inPeriod.filter((d) => d.merchant === merchant).map((d) => d.row.id).slice(0, MAX_IDS),
    };
  }
  return best;
}

function newMerchant(ctx: Ctx): AnalyticsInsight | null {
  const { period, all, inPeriod, home, total, firstDay } = ctx;
  // Everything is new in the user's first period.
  if (!firstDay || firstDay >= period.from || total <= 0) return null;
  const seenBefore = new Set(all.filter((d) => d.day < period.from && d.merchant).map((d) => d.merchant));
  const sums = new Map<string, { amount: number; ids: string[]; name: string }>();
  for (const d of inPeriod) {
    if (!d.merchant || seenBefore.has(d.merchant)) continue;
    const s = sums.get(d.merchant) ?? { amount: 0, ids: [], name: d.row.merchant_name ?? d.merchant };
    s.amount += amountOf(d.row, home);
    s.ids.push(d.row.id);
    sums.set(d.merchant, s);
  }
  let best: AnalyticsInsight | null = null;
  for (const [merchant, s] of sums) {
    if (s.amount < total * NEW_MERCHANT_MIN_SHARE) continue;
    if (best && best.kind === "new_merchant" && best.amount >= s.amount) continue;
    best = { kind: "new_merchant", merchant, name: s.name, amount: round2(s.amount), ids: s.ids.slice(0, MAX_IDS) };
  }
  return best;
}

function largest(ctx: Ctx): AnalyticsInsight | null {
  const { inPeriod, home, total } = ctx;
  if (inPeriod.length < 3 || total <= 0) return null;
  let top: DatedRow | null = null;
  let topAmount = 0;
  for (const d of inPeriod) {
    const a = amountOf(d.row, home);
    if (a > topAmount) {
      top = d;
      topAmount = a;
    }
  }
  if (!top || topAmount < total * LARGEST_MIN_SHARE) return null;
  return {
    kind: "largest",
    name: top.row.merchant_name ?? "",
    amount: round2(topAmount),
    share: Math.round((topAmount / total) * 100) / 100,
    ids: [top.row.id],
  };
}

function duplicates(ctx: Ctx): AnalyticsInsight | null {
  const ids = ctx.inPeriod.filter((d) => isPossibleDuplicate(d.row.notes)).map((d) => d.row.id);
  return ids.length > 0 ? { kind: "duplicates", count: ids.length, ids: ids.slice(0, MAX_IDS) } : null;
}

function representation(ctx: Ctx): AnalyticsInsight | null {
  if (!isSwedishVat(ctx.country, ctx.home)) return null;
  const rows = ctx.inPeriod.map((d) => d.row).filter((r) => r.category === "client_entertainment");
  // The same number as the VAT block (confirmed receipts, Swedish rates).
  const vat = vatFor(rows, ctx.home, ctx.country).representation ?? 0;
  if (vat <= 0) return null;
  const counted = rows.filter((r) => r.status === "verified" && r.currency === ctx.home);
  return {
    kind: "representation",
    amount: round2(counted.reduce((s, r) => s + amountOf(r, ctx.home), 0)),
    vat,
    ids: counted.map((r) => r.id).slice(0, MAX_IDS),
  };
}

/** The findings for a period, most useful first, at most MAX_INSIGHTS. */
export function insightsFor(ctx: Ctx): AnalyticsInsight[] {
  // Something to act on first, then what explains the numbers.
  const rules = [duplicates, categoryUp, recurring, newMerchant, representation, largest];
  const out: AnalyticsInsight[] = [];
  for (const rule of rules) {
    const hit = rule(ctx);
    if (hit) out.push(hit);
    if (out.length === MAX_INSIGHTS) break;
  }
  return out;
}
