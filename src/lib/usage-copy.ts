// What to tell a user about their receipt usage. Pure functions shared by
// the dashboard notice and the settings meter; no I/O.

import { OVERAGE_PRICE, cheapestPlanFor, formatPrice, monthlyCost, type Plan } from "./plans";

export type UsageSnapshot = {
  used: number;
  plan: Plan | null;
  extra: number;
  overageBilled: boolean;
};

/** Share of the allowance at which we start warning. */
export const WARN_AT = 0.8;

export type UsageNotice =
  | { level: "warn"; message: string }
  | { level: "over"; message: string };

/** Dashboard notice, or null when there is nothing worth saying. */
export function usageNotice(u: UsageSnapshot): UsageNotice | null {
  if (!u.plan) return null;
  const allowance = u.plan.receipts;
  if (u.extra > 0) {
    const cost = formatPrice(u.extra * OVERAGE_PRICE);
    return {
      level: "over",
      message: u.overageBilled
        ? `You're ${u.extra} receipt${u.extra === 1 ? "" : "s"} over your ${u.plan.name} plan (${allowance} a month). Extra receipts are ${formatPrice(OVERAGE_PRICE)} each — ${cost} so far, on your next invoice.`
        : `You're ${u.extra} receipt${u.extra === 1 ? "" : "s"} over your ${u.plan.name} plan (${allowance} a month). Everything is still saved.`,
    };
  }
  if (u.used >= Math.ceil(allowance * WARN_AT)) {
    return {
      level: "warn",
      message: `You've used ${u.used} of the ${allowance} receipts in your ${u.plan.name} plan this period. Extra receipts are ${formatPrice(OVERAGE_PRICE)} each.`,
    };
  }
  return null;
}

/**
 * A cheaper plan for this period's volume, if the user is on the wrong one
 * — e.g. Light plus 30 extra receipts costs more than Regular.
 */
export function planSuggestion(u: UsageSnapshot): string | null {
  if (!u.plan) return null;
  const best = cheapestPlanFor(u.used);
  if (best.id === u.plan.id) return null;
  const current = monthlyCost(u.plan, u.used);
  const better = monthlyCost(best, u.used);
  if (better >= current) return null;
  return `At ${u.used} receipts, ${best.name} would cost ${formatPrice(better)} instead of ${formatPrice(current)} a month.`;
}
