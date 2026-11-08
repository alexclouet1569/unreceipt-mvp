// SERVER-ONLY. Amounts in the organisation's home currency (2026-11-05).
//
// A receipt keeps the amount printed on it (`total`, `currency`). Next to
// it we store `home_total` in the organisation's currency:
//   * same currency          → home_total = total, fx_source 'same'
//   * foreign currency       → ECB reference rate of the purchase day, or
//                              of the last banking day before it ('ecb')
//   * typed from the bank statement → 'manual', kept until total,
//                              currency or date change (a DB trigger,
//                              receipts_clear_stale_fx, drops it then)
// Rules and sources: src/lib/bookkeeping/rules.ts. Rates are cached in
// public.fx_rates. Everything here is best effort: when no rate can be
// found the receipt has no home_total yet, and screens list it apart
// instead of adding it in.

import { getSupabaseAdmin } from "./supabase-admin";
import {
  FX_FIRST_RATE_DATE,
  FX_MAX_RATE_AGE_DAYS,
} from "./bookkeeping/rules";
import type { Receipt } from "./types";

const ECB_90D = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const ECB_ALL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
// Only these are cached: the receipt and company currencies we support,
// plus the neighbours a Nordic company meets. Keeps a full-history fetch
// to a few tens of thousands of rows.
const CACHED_CURRENCIES = new Set(["SEK", "USD", "GBP", "NOK", "DKK", "CHF", "PLN"]);
// The 90-day file covers recent dates; older ones need the full history.
const RECENT_DAYS = 85;

export type DayRates = { date: string; perEur: Record<string, number> };

/** Parses the ECB eurofxref XML into one entry per day (EUR = 1 is added). */
export function parseEcbXml(xml: string): DayRates[] {
  const days: DayRates[] = [];
  const dayRe = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g;
  for (const m of xml.matchAll(dayRe)) {
    const perEur: Record<string, number> = { EUR: 1 };
    for (const r of m[2].matchAll(rateRe)) {
      const rate = Number(r[2]);
      if (Number.isFinite(rate) && rate > 0) perEur[r[1]] = rate;
    }
    days.push({ date: m[1], perEur });
  }
  return days;
}

/** Units of `to` for one unit of `from`, from per-EUR rates. */
export function crossRate(perEur: Record<string, number>, from: string, to: string): number | null {
  const f = from === "EUR" ? 1 : perEur[from];
  const t = to === "EUR" ? 1 : perEur[to];
  if (!f || !t) return null;
  return t / f;
}

/** Rounds to `places` decimals without binary-float halves (1.005 → 1.01). */
export function roundTo(n: number, places: number): number {
  return Number(`${Math.round(Number(`${n}e${places}`))}e-${places}`);
}
export const round2 = (n: number) => roundTo(n, 2);
const round8 = (n: number) => roundTo(n, 8);

/**
 * The day a receipt is converted on: its purchase day, else its printed
 * date. Null without either: an upload day is not a purchase day, so such
 * a receipt waits until it has a date.
 */
export function conversionDate(r: Pick<Receipt, "purchased_at" | "receipt_date">): string | null {
  const d = (r.purchased_at ?? r.receipt_date)?.slice(0, 10);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

async function fetchEcb(full: boolean): Promise<DayRates[]> {
  const res = await fetch(full ? ECB_ALL : ECB_90D, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  return parseEcbXml(await res.text());
}

async function storeRates(days: DayRates[]): Promise<void> {
  const rows = days.flatMap((d) =>
    Object.entries(d.perEur)
      .filter(([c]) => CACHED_CURRENCIES.has(c))
      .map(([currency, per_eur]) => ({ rate_date: d.date, currency, per_eur, source: "ecb" }))
  );
  for (let i = 0; i < rows.length; i += 2000) {
    const { error } = await getSupabaseAdmin()
      .from("fx_rates")
      .upsert(rows.slice(i, i + 2000), { onConflict: "rate_date,currency" });
    if (error) throw new Error(`fx_rates upsert ${error.code}`);
  }
}

type Cached = { perEur: number; rateDate: string; coveredUntil: string };

/** Latest cached rate on or before `date`, and the newest day cached at all. */
async function cachedRate(currency: string, date: string): Promise<Cached | null> {
  const db = getSupabaseAdmin();
  const [onOrBefore, newest] = await Promise.all([
    db
      .from("fx_rates")
      .select("rate_date, per_eur")
      .eq("currency", currency)
      .lte("rate_date", date)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("fx_rates")
      .select("rate_date")
      .eq("currency", currency)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (onOrBefore.error || !onOrBefore.data || !newest.data) return null;
  return {
    perEur: Number(onOrBefore.data.per_eur),
    rateDate: onOrBefore.data.rate_date as string,
    coveredUntil: newest.data.rate_date as string,
  };
}

/**
 * A cached rate is the right one for `date` when it is that day's, or when
 * the cache already holds a later day (so nothing was published in
 * between: a weekend or holiday) and the gap is short.
 */
function usable(c: Cached | null, date: string): c is Cached {
  if (!c) return false;
  if (c.rateDate === date) return true;
  return c.coveredUntil > date && daysBetween(c.rateDate, date) <= FX_MAX_RATE_AGE_DAYS;
}

export type FetchBudget = Set<"90d" | "all">;

/**
 * Rate from `from` to `to` on `date`: the ECB rate of that day, or of the
 * last banking day before it. Null when it isn't known (yet): dates before
 * the first ECB rate or in the future, or today before the ECB publishes.
 * Fetches from the ECB at most once per file per run (`budget`), and never
 * for a date it can't hold.
 */
export async function rateOn(
  date: string,
  from: string,
  to: string,
  budget: FetchBudget = new Set()
): Promise<{ rate: number; rateDate: string } | null> {
  if (date < FX_FIRST_RATE_DATE || date > today()) return null;
  const sides = [from, to].filter((c) => c !== "EUR");
  if (sides.some((c) => !CACHED_CURRENCIES.has(c))) return null;

  const read = async () => {
    const found = await Promise.all(sides.map((c) => cachedRate(c, date)));
    if (!found.every((c) => usable(c, date))) return null;
    const perEur: Record<string, number> = { EUR: 1 };
    let rateDate = date;
    sides.forEach((c, i) => {
      const hit = found[i] as Cached;
      perEur[c] = hit.perEur;
      if (hit.rateDate < rateDate) rateDate = hit.rateDate;
    });
    const rate = crossRate(perEur, from, to);
    return rate ? { rate, rateDate } : null;
  };

  const hit = await read();
  if (hit) return hit;
  // Today's rate appears around 16:00 CET; until the cache has it, wait
  // rather than convert at yesterday's rate for good.
  if (date === today()) return null;
  const kind = daysBetween(date, today()) > RECENT_DAYS ? "all" : "90d";
  if (budget.has(kind)) return null;
  budget.add(kind);
  try {
    await storeRates(await fetchEcb(kind === "all"));
  } catch (err) {
    console.error("[fx] ECB fetch failed", err);
    return null;
  }
  return read();
}

export type HomeFields = Pick<Receipt, "home_currency" | "home_total" | "fx_rate" | "fx_date" | "fx_source">;

/**
 * Does this row need (re)converting for `home`? True when it was never
 * converted, was converted to another currency, or its stored conversion
 * no longer matches its amount. A typed bank amount stays.
 */
export function needsConversion(r: Receipt, home: string): boolean {
  if (r.total == null || (conversionDate(r) == null && r.currency !== home)) return false;
  if (r.home_currency !== home || r.home_total == null) return true;
  switch (r.fx_source) {
    case "manual":
      return false;
    case "same":
      return r.currency !== home || r.home_total !== r.total;
    case "ecb":
      return r.currency === home || r.fx_rate == null || r.home_total !== round2(r.total * r.fx_rate);
    default:
      return true;
  }
}

/** The fields for `r` in `home`, or null when no rate is known yet. */
export async function homeFieldsFor(r: Receipt, home: string, budget: FetchBudget): Promise<HomeFields | null> {
  const total = r.total as number;
  if (r.currency === home) {
    return { home_currency: home, home_total: total, fx_rate: 1, fx_date: null, fx_source: "same" };
  }
  const date = conversionDate(r);
  if (!date) return null;
  const found = await rateOn(date, r.currency, home, budget).catch(() => null);
  if (!found) return null;
  // home_total is computed from the stored rate, so total × the rate shown
  // in the export gives exactly Total SEK.
  const rate = round8(found.rate);
  return { home_currency: home, home_total: round2(total * rate), fx_rate: rate, fx_date: found.rateDate, fx_source: "ecb" };
}

/**
 * Fills home_total for every row that needs it and saves the result.
 * Returns the rows with the fields set; rows that couldn't be converted
 * keep home_total null. The write only lands if the row still has the
 * amount, currency and conversion it was read with, so a concurrent edit
 * is never overwritten with a stale conversion.
 */
export async function ensureHomeAmounts(rows: Receipt[], home: string): Promise<Receipt[]> {
  const budget: FetchBudget = new Set();
  const out: Receipt[] = [];
  // The saves don't change what's returned: they run together at the end
  // instead of one after the other inside the loop.
  const saves: PromiseLike<void>[] = [];
  for (const r of rows) {
    if (!needsConversion(r, home)) {
      out.push(r);
      continue;
    }
    const fields = await homeFieldsFor(r, home, budget);
    if (!fields) {
      out.push(r);
      continue;
    }
    let write = getSupabaseAdmin()
      .from("receipts")
      .update(fields)
      .eq("id", r.id)
      .eq("total", r.total as number)
      .eq("currency", r.currency);
    write = r.home_total == null ? write.is("home_total", null) : write.eq("home_total", r.home_total);
    saves.push(
      write.then(({ error }) => {
        if (error) console.error("[fx] save failed", error.code);
      }),
    );
    out.push({ ...r, ...fields });
  }
  await Promise.all(saves);
  return out;
}

/** The organisation's home currency; SEK when unknown. */
export async function homeCurrencyOf(organizationId: string | null): Promise<string> {
  if (!organizationId) return "SEK";
  const { data } = await getSupabaseAdmin()
    .from("organizations")
    .select("currency")
    .eq("id", organizationId)
    .maybeSingle();
  const c = data?.currency;
  return typeof c === "string" && /^[A-Z]{3}$/.test(c) ? c : "SEK";
}
