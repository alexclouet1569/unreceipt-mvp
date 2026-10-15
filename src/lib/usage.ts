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

    await getStripe().billing.meterEvents.create(
      {
        event_name: eventName,
        payload: { stripe_customer_id: sub.stripe_customer_id, value: "1" },
        // Stripe dedupes on this, so a retried request can't double-charge.
        identifier: `receipt_${input.receiptId}`,
      },
      // The receipt is already saved; don't hold the user's request for
      // long on Stripe. A miss here is logged (see launch plan: sweep).
      { timeout: 5000, maxNetworkRetries: 1 }
    );

    await db
      .from("receipt_usage")
      .update({ overage_billed_at: new Date().toISOString() })
      .eq("receipt_id", input.receiptId);
  } catch (err) {
    console.error("[usage] recording failed", err);
    Sentry.captureException(err, { tags: { area: "usage" } });
  }
}
