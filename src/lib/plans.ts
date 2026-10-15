import type { Locale } from "@/lib/locale";

/**
 * The three plans: one flat monthly price per company, sized by how many
 * receipts the company sends us. No per-user fees. Single source of truth
 * for the marketing pricing section, /subscribe and /api/checkout — change
 * a price here and in Stripe, nowhere else.
 *
 * Pure data, safe to import from client components. The Stripe price IDs
 * live in server-only env vars (see `planPriceEnv`).
 */

export type PlanId = "light" | "regular" | "heavy";

export type Plan = {
  id: PlanId;
  name: string;
  /** EUR per month for the whole company, excl. VAT. */
  price: number;
  /**
   * SEK per month for the whole company, excl. VAT, shown on the Swedish
   * site. Stripe charges it through the price's SEK currency option.
   */
  priceSek: number;
  /** Receipts per month, shared by everyone in the company. */
  receipts: number;
  who: string;
};

export const PLANS: readonly Plan[] = [
  {
    id: "light",
    name: "Light",
    price: 5.99,
    priceSek: 69,
    receipts: 15,
    who: "Freelancers and one-person businesses.",
  },
  {
    id: "regular",
    name: "Regular",
    price: 9.99,
    priceSek: 119,
    receipts: 40,
    who: "Small teams with a few people spending.",
  },
  {
    id: "heavy",
    name: "Heavy",
    price: 15.99,
    priceSek: 179,
    receipts: 100,
    who: "Teams that travel, meet clients or buy often.",
  },
];

export const PLAN_IDS = PLANS.map((p) => p.id) as [PlanId, ...PlanId[]];

/** "€5.99" — prices are shown in EUR with two decimals. */
export function formatPrice(eur: number): string {
  return `€${eur.toFixed(2)}`;
}

/** "69 kr" — whole kronor, the way Swedish prices are written. */
export function formatSek(kr: number): string {
  return `${kr} kr`;
}

/** A plan's monthly price in the currency of the given site language. */
export function planPriceLabel(plan: Plan, locale: Locale): string {
  return locale === "sv" ? formatSek(plan.priceSek) : formatPrice(plan.price);
}

/** Smallest plan whose allowance covers `receipts`, or the largest plan. */
export function planForReceipts(receipts: number): Plan {
  return PLANS.find((p) => p.receipts >= receipts) ?? PLANS[PLANS.length - 1];
}

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Name of the server-only env var holding a plan's Stripe price ID. */
export function planPriceEnv(id: PlanId): string {
  return `STRIPE_PRICE_${id.toUpperCase()}`;
}
