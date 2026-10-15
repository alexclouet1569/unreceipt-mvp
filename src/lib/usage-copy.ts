// What to tell a user about their receipt usage. Pure functions shared by
// the dashboard notice and the settings meter; no I/O. They return data,
// not sentences, so the UI can render every amount in Geist Mono
// (DESIGN.md: all monetary values are mono).

import { OVERAGE_PRICE, cheapestPlanFor, monthlyCost, type Plan } from "./plans";

export type UsageSnapshot = {
  used: number;
  plan: Plan | null;
  extra: number;
  overageBilled: boolean;
};

/** Share of the allowance at which we start warning. */
export const WARN_AT = 0.8;

export type UsageNotice =
  | { level: "warn"; planName: string; used: number; allowance: number; overagePrice: number }
  | {
      level: "over";
      planName: string;
      extra: number;
      allowance: number;
      overagePrice: number;
      /** EUR owed for extras so far, or null when extras aren't billed. */
      extraCost: number | null;
    };

/** Dashboard notice, or null when there is nothing worth saying. */
export function usageNotice(u: UsageSnapshot): UsageNotice | null {
  if (!u.plan) return null;
  const allowance = u.plan.receipts;
  if (u.extra > 0) {
    return {
      level: "over",
      planName: u.plan.name,
      extra: u.extra,
      allowance,
      overagePrice: OVERAGE_PRICE,
      extraCost: u.overageBilled ? Math.round(u.extra * OVERAGE_PRICE * 100) / 100 : null,
    };
  }
  if (u.used >= Math.ceil(allowance * WARN_AT)) {
    return {
      level: "warn",
      planName: u.plan.name,
      used: u.used,
      allowance,
      overagePrice: OVERAGE_PRICE,
    };
  }
  return null;
}

export type PlanSuggestion = {
  planName: string;
  used: number;
  /** Monthly cost on the suggested plan. */
  better: number;
  /** Monthly cost on the current plan, overage included. */
  current: number;
};

/**
 * A cheaper plan for this period's volume, if the user is on the wrong one
 * — e.g. Light plus 30 extra receipts costs more than Regular.
 */
export function planSuggestion(u: UsageSnapshot): PlanSuggestion | null {
  if (!u.plan) return null;
  const best = cheapestPlanFor(u.used);
  if (best.id === u.plan.id) return null;
  const current = monthlyCost(u.plan, u.used);
  const better = monthlyCost(best, u.used);
  if (better >= current) return null;
  return { planName: best.name, used: u.used, better, current };
}
