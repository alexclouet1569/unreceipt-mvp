/**
 * The three per-employee plans. Single source of truth for the marketing
 * pricing section, /subscribe and /api/checkout — change a price here and
 * in Stripe, nowhere else.
 *
 * Pure data, safe to import from client components. The Stripe price IDs
 * live in server-only env vars (see `planPriceEnv`).
 */

export type PlanId = "light" | "regular" | "heavy";

export type Plan = {
  id: PlanId;
  name: string;
  /** EUR per employee per month, excl. VAT. */
  price: number;
  /** Receipt allowance per employee per month, pooled across the team. */
  receipts: number;
  who: string;
  popular?: boolean;
};

export const PLANS: readonly Plan[] = [
  {
    id: "light",
    name: "Light",
    price: 5,
    receipts: 5,
    who: "Occasional spenders — office and back-office staff.",
  },
  {
    id: "regular",
    name: "Regular",
    price: 9,
    receipts: 15,
    who: "Sales, managers, anyone who meets clients.",
    popular: true,
  },
  {
    id: "heavy",
    name: "Heavy",
    price: 14,
    receipts: 40,
    who: "Field staff, consultants and frequent travellers.",
  },
];

export const PLAN_IDS = PLANS.map((p) => p.id) as [PlanId, ...PlanId[]];

export const MIN_EMPLOYEES = 1;
export const MAX_EMPLOYEES = 200;

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Name of the server-only env var holding a plan's Stripe price ID. */
export function planPriceEnv(id: PlanId): string {
  return `STRIPE_PRICE_${id.toUpperCase()}`;
}
