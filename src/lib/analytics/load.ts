// SERVER-ONLY. Reads a user's receipts for the Insights screen and the home
// summary, converting foreign amounts on the way (src/lib/fx.ts), and hands
// them to the pure code in ./aggregate.ts.
//
// Scope is the user's own receipts (user_id), like the home list and the
// customer's own export: receipts are owner-only (RLS), and this service-
// role read must never widen that.

import * as Sentry from "@sentry/nextjs";
import type { User } from "@supabase/supabase-js";
import { ensureHomeAmounts } from "@/lib/fx";
import type { MobileAnalytics, MobileReceipt } from "@/lib/mobile/types";
import { toMobileReceipt } from "@/lib/mobile/receipt";
import { getDefaultOrganizationId, hasAnyMembership } from "@/lib/organizations";
import { missingRequiredFields } from "@/lib/receipts/status";
import { getFirmMembership } from "@/lib/require-firm";
import { checkSubscriptionGate } from "@/lib/subscription-gate";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Receipt } from "@/lib/types";
import { buildAnalytics } from "./aggregate";
import { merchantKey } from "./merchants";
import {
  ANALYTICS_COLUMNS,
  contribution,
  purchaseDay,
  stockholmDay,
  SUMMARY_COLUMNS,
  type AnalyticsRow,
} from "./money";
import { resolvePeriod, type PeriodInput, type ResolvedPeriod } from "./periods";
import { needsVatCheck } from "./vat";

const PAGE = 1000;
/** A safety cap: about ten years of the largest plan. */
const MAX_ROWS = 20_000;
/** The drill-down list shows at most this many receipts. */
export const MAX_DRILL_RECEIPTS = 200;

export class AnalyticsInputError extends Error {}

/**
 * Every receipt of the user, the analytics columns only, converted to
 * `home` (and the conversions saved, as every screen does).
 */
export async function loadAnalyticsRows(userId: string, home: string): Promise<AnalyticsRow[]> {
  return convert(await readRows(userId, ANALYTICS_COLUMNS), home);
}

/**
 * The home summary's rows, as stored: no conversion and no writes on a page
 * load. A foreign receipt nobody converted yet is summed apart (the
 * Insights screen and the list convert them).
 */
export async function loadSummaryRows(userId: string, exclude: Set<string>): Promise<AnalyticsRow[]> {
  return (await readRows(userId, SUMMARY_COLUMNS)).filter((r) => !exclude.has(r.id));
}

async function readRows(userId: string, columns: string): Promise<AnalyticsRow[]> {
  const db = getSupabaseAdmin();
  const rows: AnalyticsRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db
      .from("receipts")
      .select(columns)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`analytics rows ${error.code}`);
    const page = (data ?? []) as unknown as AnalyticsRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
  Sentry.captureMessage("analytics: row cap reached", { tags: { area: "analytics" } });
  return rows;
}

async function convert(rows: AnalyticsRow[], home: string): Promise<AnalyticsRow[]> {
  // ensureHomeAmounts reads and writes only fields these rows carry.
  return (await ensureHomeAmounts(rows as unknown as Receipt[], home).catch((err) => {
    console.error("[analytics] currency conversion failed", err);
    return rows as unknown as Receipt[];
  })) as unknown as AnalyticsRow[];
}

type Access =
  | { kind: "firm_only" }
  | { kind: "inactive" }
  | { kind: "ready"; home: string; country: string };

/**
 * The company's currency and country, or an error. Never a guess here:
 * converting every receipt to the wrong currency would rewrite them all
 * (and replace amounts typed from the bank statement).
 */
async function companyOf(organizationId: string): Promise<{ home: string; country: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("currency, country")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`analytics: organization ${error.code}`);
  const home = data?.currency;
  const country = data?.country;
  if (typeof home !== "string" || !/^[A-Z]{3}$/.test(home)) throw new Error("analytics: organization currency");
  return { home, country: typeof country === "string" ? country : "" };
}

/**
 * The same who-sees-what as the home screen (src/lib/home/load-home.ts):
 * firm staff without a company and accounts without a plan get no data.
 * Reads only: the home screen is where an organisation is minted.
 */
export async function analyticsAccess(user: User): Promise<Access> {
  const [firmMembership, gate, organizationId] = await Promise.all([
    getFirmMembership(user.id),
    checkSubscriptionGate(user.id, null),
    getDefaultOrganizationId(user.id),
  ]);
  if (firmMembership && !(await hasAnyMembership(user.id))) return { kind: "firm_only" };
  if (gate.kind === "redirect_subscribe" || gate.kind === "self_heal") return { kind: "inactive" };
  // No company yet (the home screen creates it) or a failed read is an
  // error the screen retries, never a guessed currency.
  if (!organizationId) throw new Error("analytics: no organization");
  return { kind: "ready", ...(await companyOf(organizationId)) };
}

export function todayInStockholm(now = new Date()): string {
  return stockholmDay(now);
}

/** The period from query parameters; throws AnalyticsInputError when malformed. */
export function periodFromParams(params: URLSearchParams, today: string): ResolvedPeriod {
  const input: PeriodInput = {
    kind: params.get("period"),
    anchor: params.get("anchor"),
    from: params.get("from"),
    to: params.get("to"),
  };
  const period = resolvePeriod(input, today);
  if (!period) throw new AnalyticsInputError("invalid period");
  return period;
}

export async function loadAnalytics(user: User, period: ResolvedPeriod, today: string): Promise<MobileAnalytics> {
  const access = await analyticsAccess(user);
  if (access.kind !== "ready") return { state: access.kind };
  const rows = await loadAnalyticsRows(user.id, access.home);
  return buildAnalytics(rows, access.home, period, today, access.country);
}

/** What a drill-down asks for: one of these, inside the period. */
export type DrillFilter =
  | { kind: "all" }
  | { kind: "category"; category: string }
  | { kind: "merchant"; key: string }
  | { kind: "ids"; ids: string[] }
  | { kind: "quality"; which: QualityFilter };

const QUALITY = ["to_complete", "unconverted", "missing_amount", "to_confirm", "vat_to_check"] as const;
type QualityFilter = (typeof QUALITY)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function drillFilterFromParams(params: URLSearchParams): DrillFilter {
  const category = params.get("category");
  const merchant = params.get("merchant");
  const ids = params.get("ids");
  const quality = params.get("quality");
  const given = [category, merchant, ids, quality].filter((v) => v != null).length;
  if (given > 1) throw new AnalyticsInputError("one filter at most");
  if (category != null) {
    if (!/^[a-z_]{1,40}$/.test(category)) throw new AnalyticsInputError("invalid category");
    return { kind: "category", category };
  }
  if (merchant != null) {
    if (merchant.length === 0 || merchant.length > 200) throw new AnalyticsInputError("invalid merchant");
    return { kind: "merchant", key: merchant };
  }
  if (ids != null) {
    const list = ids.split(",").filter(Boolean);
    if (list.length === 0 || list.length > 50 || !list.every((id) => UUID.test(id))) {
      throw new AnalyticsInputError("invalid ids");
    }
    return { kind: "ids", ids: list };
  }
  if (quality != null) {
    if (!(QUALITY as readonly string[]).includes(quality)) throw new AnalyticsInputError("invalid quality");
    return { kind: "quality", which: quality as QualityFilter };
  }
  return { kind: "all" };
}

function matches(r: AnalyticsRow, f: DrillFilter, home: string, country: string): boolean {
  switch (f.kind) {
    case "all":
      return true;
    case "category":
      return r.category === f.category;
    case "merchant":
      return merchantKey(r.merchant_name) === f.key;
    case "ids":
      return f.ids.includes(r.id);
    case "quality": {
      if (f.which === "to_confirm") return r.status === "pending_review";
      if (f.which === "vat_to_check") return needsVatCheck(r, home, country);
      if (f.which === "to_complete") return r.status === "pending_review" && missingRequiredFields(r).length > 0;
      const c = contribution(r, home).kind;
      return f.which === "unconverted" ? c === "foreign" : c === "none";
    }
  }
}

/** The receipts behind a number on the Insights screen, newest first, as the app's display JSON. */
export async function loadDrillReceipts(
  user: User,
  period: ResolvedPeriod,
  filter: DrillFilter
): Promise<{ receipts: MobileReceipt[]; truncated: boolean } | { state: "firm_only" | "inactive" }> {
  const result = await loadDrillRows(user, period, filter);
  if ("state" in result) return result;
  return { receipts: result.rows.map(toMobileReceipt), truncated: result.truncated };
}

/**
 * The same receipts as full rows, for the website's drill-down page, which
 * opens them in the receipt sheet. Same scope (user_id) and access rules.
 */
export async function loadDrillRows(
  user: User,
  period: ResolvedPeriod,
  filter: DrillFilter
): Promise<{ rows: Receipt[]; truncated: boolean } | { state: "firm_only" | "inactive" }> {
  const access = await analyticsAccess(user);
  if (access.kind !== "ready") return { state: access.kind };
  const rows = await loadAnalyticsRows(user.id, access.home);
  const hits = rows
    .map((r) => ({ r, day: purchaseDay(r) }))
    .filter((x): x is { r: AnalyticsRow; day: string } => x.day != null && x.day >= period.from && x.day <= period.to)
    .filter((x) => matches(x.r, filter, access.home, access.country))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.r.created_at.localeCompare(a.r.created_at)));
  const ids = hits.slice(0, MAX_DRILL_RECEIPTS).map((x) => x.r.id);
  if (ids.length === 0) return { rows: [], truncated: false };

  const full: Receipt[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await getSupabaseAdmin()
      .from("receipts")
      .select("*")
      .eq("user_id", user.id)
      .in("id", ids.slice(i, i + 100));
    if (error) throw new Error(`drill receipts ${error.code}`);
    full.push(...((data ?? []) as Receipt[]));
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  full.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const converted = await ensureHomeAmounts(full, access.home).catch(() => full);
  return { rows: converted, truncated: hits.length > ids.length };
}
