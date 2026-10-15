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

// Sizing (Oct 2026 pricing review, docs/plans/unreceipt-launch-plan.md §1a):
// about half of an SME's staff ever expense anything, and each of them
// files roughly 1–5 receipts a month (12/27/62 a year low/base/high). So
// 15 receipts ≈ a 1–3 person business, 50 ≈ a team of up to ~20, 150 ≈ up
// to ~50. Per receipt that is €0.40 / €0.30 / €0.20 — Light sits at parity
// with Fortnox's 4.90 kr, the larger plans below it.
export const PLANS: readonly Plan[] = [
  {
    id: "light",
    name: "Light",
    price: 5.99,
    priceSek: 69,
    receipts: 15,
    who: "Freelancers and businesses of 1–3 people.",
  },
  {
    id: "regular",
    name: "Regular",
    price: 14.99,
    priceSek: 169,
    receipts: 50,
    who: "Teams of up to about 20 people.",
  },
  {
    id: "heavy",
    name: "Heavy",
    price: 29.99,
    priceSek: 329,
    receipts: 150,
    who: "Teams of up to about 50, or that travel a lot.",
  },
];

/**
 * EUR per receipt above the plan's monthly allowance, excl. VAT. Higher
 * than any plan's own per-receipt price, so a company that keeps going
 * over is better off on the next plan — and nobody is ever blocked from
 * saving a receipt (it's a legal document).
 */
export const OVERAGE_PRICE = 0.4;

/** The same extra-receipt price in SEK, shown on the Swedish site. */
export const OVERAGE_PRICE_SEK = 4.9;

export const PLAN_IDS = PLANS.map((p) => p.id) as [PlanId, ...PlanId[]];

/** "€5.99" — prices are shown in EUR with two decimals. */
export function formatPrice(eur: number): string {
  return `€${eur.toFixed(2)}`;
}

/** "69 kr", or "4,90 kr" with öre — the way Swedish prices are written. */
export function formatSek(kr: number): string {
  return Number.isInteger(kr) ? `${kr} kr` : `${kr.toFixed(2).replace(".", ",")} kr`;
}

/** "5,99 €" — the way French prices are written (non-breaking space). */
export function formatEurFr(eur: number): string {
  return `${eur.toFixed(2).replace(".", ",")}\u00a0€`;
}

/** A plan's monthly price in the currency and style of the site language. */
export function planPriceLabel(plan: Plan, locale: Locale): string {
  if (locale === "sv") return formatSek(plan.priceSek);
  if (locale === "fr") return formatEurFr(plan.price);
  return formatPrice(plan.price);
}

/** The extra-receipt price in the currency of the given site language. */
export function overagePriceLabel(locale: Locale): string {
  if (locale === "sv") return formatSek(OVERAGE_PRICE_SEK);
  if (locale === "fr") return formatEurFr(OVERAGE_PRICE);
  return formatPrice(OVERAGE_PRICE);
}

/** Smallest plan whose allowance covers `receipts`, or the largest plan. */
export function planForReceipts(receipts: number): Plan {
  return PLANS.find((p) => p.receipts >= receipts) ?? PLANS[PLANS.length - 1];
}

/** What a month costs on `plan` with `receipts` sent: base + overage. */
export function monthlyCost(plan: Plan, receipts: number): number {
  const extra = Math.max(0, receipts - plan.receipts);
  return Math.round((plan.price + extra * OVERAGE_PRICE) * 100) / 100;
}

/** The plan with the lowest monthly cost for `receipts`, overage included. */
export function cheapestPlanFor(receipts: number): Plan {
  return PLANS.reduce((best, p) =>
    monthlyCost(p, receipts) < monthlyCost(best, receipts) ? p : best
  );
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
