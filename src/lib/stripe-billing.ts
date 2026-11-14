// SERVER-ONLY. What we know about a user's Stripe billing from our own
// subscriptions rows (written by the Stripe webhook): the Stripe customer
// to reuse, whether a subscription is still running, and whether the
// free week was already used. Shared by /api/checkout, /api/billing/portal,
// /subscribe and Settings.

import { getSupabaseAdmin } from "./supabase-admin";

// A subscription in one of these states still bills (or will retry a
// failed payment), so a second Checkout would charge the company twice.
export const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

export type BillingRow = {
  stripe_customer_id: string | null;
  status: string | null;
};

export type BillingAccount = {
  /** The Stripe customer of the most recent subscription, if any. */
  customerId: string | null;
  /** True when any subscription is active, trialing or past due. */
  hasLiveSubscription: boolean;
  /**
   * True once the user has had any subscription. Every Checkout so far
   * started with the free week, so a returning customer doesn't get it
   * again.
   */
  hadSubscription: boolean;
};

/** Rows newest first (as loaded). Pure, for tests. */
export function summarizeBilling(rows: readonly BillingRow[]): BillingAccount {
  const customerId =
    rows.map((r) => r.stripe_customer_id?.trim() || null).find((id) => id !== null) ?? null;
  return {
    customerId,
    hasLiveSubscription: rows.some((r) => r.status !== null && LIVE_SUBSCRIPTION_STATUSES.has(r.status)),
    hadSubscription: rows.length > 0,
  };
}

/**
 * Reads the user's subscriptions rows. Throws on a database error: callers
 * that could charge someone (Checkout) must not guess.
 */
export async function loadBillingAccount(userId: string): Promise<BillingAccount> {
  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("stripe_customer_id, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`subscriptions read failed (${error.code ?? "unknown"})`);
  return summarizeBilling((data ?? []) as BillingRow[]);
}

/**
 * Where the Stripe customer portal sends the customer back: Settings on
 * the product host, whichever host started the session.
 */
export function billingReturnUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.unreceipt.com").replace(/\/+$/, "");
  return `${base}/app/settings`;
}
