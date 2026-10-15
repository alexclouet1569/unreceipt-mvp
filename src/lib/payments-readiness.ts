// SERVER-ONLY. "Are we ready to take money?" — the go-live checklist for
// payments, shown on /admin until it's complete. Only env-var presence is
// checked automatically; the Stripe-dashboard steps that can't be read from
// here are listed as manual reminders.

import { PLAN_IDS, planPriceEnv } from "./plans";
import { isPilotMode } from "./pilot";

export type ReadinessCheck = { label: string; ok: boolean };

export type PaymentsReadiness = {
  pilotMode: boolean;
  /** Automatic checks (env vars set in Vercel). */
  checks: ReadinessCheck[];
  /** Steps in the Stripe dashboard nobody can verify from the app. */
  manual: string[];
  ready: boolean;
};

const MANUAL_STEPS = [
  "Stripe account switched to live mode (business verified)",
  "Swedish VAT registration added under Stripe → Tax → Registrations",
  "The 3 plan prices are monthly EUR prices with tax behaviour \"exclusive\"",
  "Billing meter \"extra_receipt\" (sum) + a €0.40 metered price on it",
  "Live webhook endpoint at /api/webhooks/stripe with the 4 subscription events",
  "Test purchase with a real card, then cancel and refund it",
];

export function paymentsReadiness(env: NodeJS.ProcessEnv = process.env): PaymentsReadiness {
  const has = (name: string) => Boolean(env[name] && env[name]!.length > 0);
  const checks: ReadinessCheck[] = [
    {
      label: "STRIPE_SECRET_KEY is a live key (sk_live_…)",
      ok: (env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_"),
    },
    { label: "STRIPE_WEBHOOK_SECRET", ok: has("STRIPE_WEBHOOK_SECRET") },
    ...PLAN_IDS.map((id) => ({ label: planPriceEnv(id), ok: has(planPriceEnv(id)) })),
    { label: "STRIPE_PRICE_OVERAGE (extra receipts)", ok: has("STRIPE_PRICE_OVERAGE") },
    { label: "STRIPE_METER_EVENT_NAME (extra receipts)", ok: has("STRIPE_METER_EVENT_NAME") },
  ];
  return {
    pilotMode: isPilotMode(),
    checks,
    manual: MANUAL_STEPS,
    ready: checks.every((c) => c.ok),
  };
}
