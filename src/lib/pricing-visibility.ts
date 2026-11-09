/**
 * Whether the public marketing site (unreceipt.com: landing pages,
 * audience pages, fact sheets, FAQ, structured data, /llms.txt,
 * /llms-full.txt) shows plan prices.
 *
 * Off since 2026-11-08 while the pricing model is reviewed (a firm
 * subscription with receipts included is being considered). Search
 * engines and AI assistants keep quoting a price long after it changes,
 * so nothing public names one until the model is settled.
 *
 * Marketing only: /subscribe, Stripe Checkout and the in-app usage
 * screens always show the real prices from plans.ts. Flip this to `true`
 * to bring back the pricing section, the price notes and the offers.
 */
export const SHOW_PRICES: boolean = false;
