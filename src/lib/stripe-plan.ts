// SERVER-ONLY. Reads which plan a Stripe subscription is on, and its
// current billing period, for the subscriptions table.

import type Stripe from "stripe";
import { PLAN_IDS, planPriceEnv, type PlanId } from "./plans";

type SubscriptionLike = {
  metadata?: Stripe.Metadata | null;
  items?: {
    data?: Array<{
      price?: { id?: string } | null;
      current_period_start?: number | null;
      current_period_end?: number | null;
    }>;
  };
};

/**
 * The plan behind a subscription. Matches the subscription's prices
 * against STRIPE_PRICE_LIGHT/_REGULAR/_HEAVY first, so a plan change made
 * in Stripe is picked up; falls back to the plan stamped in metadata at
 * checkout. The metered extra-receipt price matches no plan and is skipped.
 */
export function planFromSubscription(sub: SubscriptionLike): PlanId | null {
  for (const item of sub.items?.data ?? []) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    const match = PLAN_IDS.find((id) => process.env[planPriceEnv(id)] === priceId);
    if (match) return match;
  }
  const fromMetadata = sub.metadata?.plan;
  return fromMetadata && (PLAN_IDS as readonly string[]).includes(fromMetadata)
    ? (fromMetadata as PlanId)
    : null;
}

/** Start of the current billing period, as ISO, from the first item. */
export function periodStartFromSubscription(sub: SubscriptionLike): string | null {
  const unix = sub.items?.data?.[0]?.current_period_start ?? null;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

/** True when the subscription includes the metered extra-receipt price. */
export function hasOverageItem(sub: SubscriptionLike): boolean {
  const overage = process.env.STRIPE_PRICE_OVERAGE;
  if (!overage) return false;
  return (sub.items?.data ?? []).some((item) => item.price?.id === overage);
}
