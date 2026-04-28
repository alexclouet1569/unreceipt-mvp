// SERVER-ONLY. Never import from a "use client" component or hook.
//
// STRIPE_SECRET_KEY is intentionally not NEXT_PUBLIC_* — an accidental client
// import resolves the env to undefined and getStripe() throws fast rather
// than silently leaking the secret key into a browser bundle.

import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");

  client = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return client;
}
