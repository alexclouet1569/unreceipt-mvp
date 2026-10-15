// SERVER-ONLY. Receipt usage against the plan's monthly allowance.
//
// Every receipt the server creates (photo capture, forwarded email, admin
// paste) is recorded once in public.receipt_usage. Deleting a receipt does
// not remove its usage row, so the allowance can't be reset by deleting.
//
// Usage is counted over the subscription's billing period (the same one
// Stripe invoices), or the calendar month when there is no subscription
// (pilot users). Receipts above the plan's allowance are reported to a
// Stripe Billing Meter and charged at OVERAGE_PRICE on the next invoice.
// Nobody is ever blocked from saving a receipt: it's a legal document.
//
// recordReceiptUsage() never throws — a usage or Stripe hiccup must not
// lose the customer's receipt. Failures are logged and sent to Sentry.

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "./supabase-admin";
import { getStripe } from "./stripe";
import { PLAN_IDS, getPlan, type Plan, type PlanId } from "./plans";

export type UsageSource = "paper" | "email" | "manual" | "sms";

/** Maps a receipt's stored source to a usage source. */
export function usageSource(source: string | null | undefined): UsageSource {
  return source === "paper" || source === "email" || source === "sms" ? source : "manual";
}

/**
 * Safety cap on extra receipts billed per period. Far above any real
 * team's volume; it bounds the damage if something goes wrong (a bug, an
 * abused alias) at €0.40 × 300 = €120 before a human looks at it.
 */
export const MAX_BILLED_EXTRAS_PER_PERIOD = 300;

type BillingSubscription = {
  status: string;
  plan: string | null;
  /** True when the subscription carries the metered extra-receipt price. */
  overage_enabled: boolean | null;
  stripe_customer_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
};

export type Usage = {
  /** Receipts created in the current period, deleted ones included. */
  used: number;
  /** The paid plan, or null (pilot / no active subscription). */
  plan: Plan | null;
  /** Receipts above the allowance this period (0 without a plan). */
  extra: number;
  periodStart: Date;
  periodEnd: Date;
  /** True when extra receipts are actually charged via Stripe. */
  overageBilled: boolean;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/** Name of the Stripe Billing Meter event for extra receipts, if set up. */
function overageMeterEvent(): string | null {
  return process.env.STRIPE_METER_EVENT_NAME || null;
}

function asPlan(id: string | null): Plan | null {
  return id && (PLAN_IDS as readonly string[]).includes(id)
    ? getPlan(id as PlanId)
    : null;
}

/**
 * The period usage is counted over: the subscription's current billing
 * period when we know it, otherwise the calendar month (UTC).
 */
export function billingPeriod(
  sub: Pick<BillingSubscription, "current_period_start" | "current_period_end"> | null,
  now: Date = new Date()
): { start: Date; end: Date } {
  if (sub?.current_period_end) {
    const end = new Date(sub.current_period_end);
    const start = sub.current_period_start
      ? new Date(sub.current_period_start)
      : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()));
    if (start <= now && now < end) return { start, end };
  }
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

async function loadSubscription(userId: string): Promise<BillingSubscription | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("status, plan, overage_enabled, stripe_customer_id, current_period_start, current_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`subscription lookup failed: ${error.code ?? "unknown"}`);
  return (data as BillingSubscription | null) ?? null;
}

/**
 * Usage rows from `from` up to and including `upTo`. `upTo` may be the raw
 * timestamp string Postgres returned: it has microseconds, and a Date
 * round-trip would truncate them and exclude the row itself.
 */
async function countUsage(
  userId: string,
  from: Date,
  upTo: Date | string
): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("receipt_usage")
    .select("receipt_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", from.toISOString())
    .lte("created_at", typeof upTo === "string" ? upTo : upTo.toISOString());
  if (error) throw new Error(`usage count failed: ${error.code ?? "unknown"}`);
  return count ?? 0;
}

/** Current period usage for the settings page and the over-limit banner. */
export async function getUsage(userId: string, now: Date = new Date()): Promise<Usage> {
  const sub = await loadSubscription(userId);
  const period = billingPeriod(sub, now);
  const plan = sub && ACTIVE_STATUSES.has(sub.status) ? asPlan(sub.plan) : null;
  const used = await countUsage(userId, period.start, now);
  return {
    used,
    plan,
    extra: plan ? Math.max(0, used - plan.receipts) : 0,
    periodStart: period.start,
    periodEnd: period.end,
    overageBilled: Boolean(
      plan && sub?.status === "active" && sub.overage_enabled && overageMeterEvent()
    ),
  };
}

/**
 * Records a newly created receipt and, when it falls above the plan's
 * allowance on an active paid subscription, reports it to Stripe as one
 * extra receipt. Idempotent per receipt. Never throws.
 */
export async function recordReceiptUsage(input: {
  userId: string;
  receiptId: string;
  source: UsageSource;
}): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const { data: row, error } = await db
      .from("receipt_usage")
      .upsert(
        { receipt_id: input.receiptId, user_id: input.userId, source: input.source },
        { onConflict: "receipt_id", ignoreDuplicates: true }
      )
      .select("created_at")
      .maybeSingle();
    if (error) throw new Error(`usage insert failed: ${error.code ?? "unknown"}`);
    // Already recorded (retry / duplicate delivery): nothing more to do.
    if (!row) return;

    const eventName = overageMeterEvent();
    if (!eventName) return;

    const sub = await loadSubscription(input.userId);
    // No overage during the free trial, without a paid plan, or on a
    // subscription that has no metered extra-receipt price to bill it on
    // (e.g. created before overage existed) — those events would be
    // accepted by Stripe but never invoiced.
    if (!sub || sub.status !== "active" || !sub.overage_enabled) return;
    const plan = asPlan(sub.plan);
    if (!plan) return;

    // This receipt's position in the period (itself included), counted up
    // to its own timestamp rather than "now": when two receipts arrive
    // together, the earlier one isn't billed because of the later one.
    const createdAtRaw = row.created_at as string;
    const period = billingPeriod(sub, new Date(createdAtRaw));
    const position = await countUsage(input.userId, period.start, createdAtRaw);
    if (position <= plan.receipts) return;
    if (position - plan.receipts > MAX_BILLED_EXTRAS_PER_PERIOD) {
      console.error("[usage] extra-receipt cap reached, not billing", {
        userId: input.userId,
      });
      Sentry.captureMessage("extra-receipt billing cap reached", {
        tags: { area: "usage" },
      });
      return;
    }

    await reportExtraReceipt({
      eventName,
      receiptId: input.receiptId,
      customerId: sub.stripe_customer_id,
      createdAt: createdAtRaw,
      // The receipt is already saved; don't hold the user's request for
      // long on Stripe. A miss is retried by the daily sweep.
      timeoutMs: 5000,
    });
  } catch (err) {
    console.error("[usage] recording failed", err);
    Sentry.captureException(err, { tags: { area: "usage" } });
  }
}

/**
 * Reports one extra receipt to the Stripe meter and marks it billed.
 * `overage_attempted_at` is written first: Stripe only dedupes the
 * identifier for "a rolling period of at least 24 hours", so the sweep must
 * know when an earlier attempt may already have reached Stripe.
 */
async function reportExtraReceipt(input: {
  eventName: string;
  receiptId: string;
  customerId: string;
  createdAt: string;
  timeoutMs: number;
}): Promise<void> {
  const db = getSupabaseAdmin();
  // First attempt only: Stripe's dedupe window runs from the first event
  // it may have received, so later retries must not move the marker.
  const { error: markError } = await db
    .from("receipt_usage")
    .update({ overage_attempted_at: new Date().toISOString() })
    .eq("receipt_id", input.receiptId)
    .is("overage_attempted_at", null);
  // Without the marker a later retry can't tell whether this call reached
  // Stripe, so don't make it.
  if (markError) throw new Error(`usage attempt mark failed: ${markError.code ?? "unknown"}`);

  await getStripe().billing.meterEvents.create(
    {
      event_name: input.eventName,
      payload: { stripe_customer_id: input.customerId, value: "1" },
      // Stripe dedupes on this within its window (see above).
      identifier: `receipt_${input.receiptId}`,
      // Counted in the period the receipt was saved in, also on a retry.
      timestamp: Math.floor(Date.parse(input.createdAt) / 1000),
    },
    { timeout: input.timeoutMs, maxNetworkRetries: 1 }
  );

  await db
    .from("receipt_usage")
    .update({ overage_billed_at: new Date().toISOString() })
    .eq("receipt_id", input.receiptId);
}

// A retry is only safe while Stripe still dedupes the first attempt (at
// least 24 hours from it); keep a margin for clock skew and slow requests.
export const SAFE_RETRY_WINDOW_MS = 20 * 60 * 60 * 1000;

export type OverageSweepResult = {
  subscriptions: number;
  reported: number;
  failed: number;
  // Attempted more than SAFE_RETRY_WINDOW_MS ago and never confirmed: may or
  // may not be on Stripe. Left for a person to check (Sentry alert).
  ambiguous: number;
};

/**
 * Daily retry of extra receipts whose Stripe report failed (launch plan P5,
 * run by /api/cron/overage-sweep). For each active subscription with the
 * metered price, finds this period's receipts above the allowance that were
 * never confirmed billed and reports them. Current period only: once a
 * period is invoiced, a late event no longer reaches that invoice.
 */
export async function sweepUnbilledOverage(now: Date = new Date()): Promise<OverageSweepResult> {
  const result: OverageSweepResult = { subscriptions: 0, reported: 0, failed: 0, ambiguous: 0 };
  const eventName = overageMeterEvent();
  if (!eventName) return result;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("subscriptions")
    .select(
      "user_id, status, plan, overage_enabled, stripe_customer_id, current_period_start, current_period_end, created_at"
    )
    .eq("status", "active")
    .eq("overage_enabled", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`subscriptions read failed: ${error.code ?? "unknown"}`);

  // Same subscription the live path uses: the newest row per user.
  const latest = new Map<string, BillingSubscription & { user_id: string }>();
  for (const row of (data ?? []) as Array<BillingSubscription & { user_id: string }>) {
    if (!latest.has(row.user_id)) latest.set(row.user_id, row);
  }

  for (const [userId, sub] of latest) {
    const plan = asPlan(sub.plan);
    if (!plan) continue;
    result.subscriptions++;
    const period = billingPeriod(sub, now);

    const { data: rows, error: rowsError } = await db
      .from("receipt_usage")
      .select("receipt_id, created_at, overage_billed_at, overage_attempted_at")
      .eq("user_id", userId)
      .gte("created_at", period.start.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: true })
      .order("receipt_id", { ascending: true })
      .limit(plan.receipts + MAX_BILLED_EXTRAS_PER_PERIOD);
    if (rowsError) {
      result.failed++;
      continue;
    }

    const extras = (rows ?? []).slice(plan.receipts);
    for (const row of extras) {
      if (row.overage_billed_at) continue;
      const attempted = row.overage_attempted_at ? Date.parse(row.overage_attempted_at) : null;
      if (attempted != null && now.getTime() - attempted > SAFE_RETRY_WINDOW_MS) {
        result.ambiguous++;
        continue;
      }
      try {
        await reportExtraReceipt({
          eventName,
          receiptId: row.receipt_id,
          customerId: sub.stripe_customer_id,
          createdAt: row.created_at,
          timeoutMs: 15000,
        });
        result.reported++;
      } catch (err) {
        result.failed++;
        console.error("[usage] sweep report failed", err instanceof Error ? err.message : "unknown");
      }
    }
  }

  if (result.ambiguous > 0) {
    Sentry.captureMessage("extra receipts need a manual billing check", {
      level: "warning",
      tags: { area: "usage-sweep" },
      extra: { count: result.ambiguous },
    });
  }
  return result;
}
