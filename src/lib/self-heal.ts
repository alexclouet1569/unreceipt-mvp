// SERVER-ONLY. Plan A4 self-heal: a customer who lands on /app right after
// completing Stripe Checkout — `?session_id=cs_test_…` — and whose webhook
// hasn't arrived yet. We fetch the Stripe Session directly, upsert the
// subscription row using the same shape the webhook would write, and let
// the gate re-run.
//
// Three outcomes the caller cares about:
//   "success"      — sub upserted, /app should render the dashboard
//   "not_paid"     — checkout wasn't completed, /app should bounce to /subscribe
//   "stripe_down"  — Stripe API failed; show the spinner + retry path

import type Stripe from "stripe";
import { getStripe } from "./stripe";
import { getSupabaseAdmin } from "./supabase-admin";

export type SelfHealOutcome = "success" | "not_paid" | "stripe_down";

type SessionPaymentStatus = Stripe.Checkout.Session["payment_status"];

const PAID_STATUSES = new Set<SessionPaymentStatus>([
  "paid",
  "no_payment_required",
]);

export async function handleSelfHeal(
  userId: string,
  sessionId: string
): Promise<SelfHealOutcome> {
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
  } catch (err) {
    // TODO(step-11): Sentry.captureException(err, { tags: { area: "self-heal" } });
    console.error("[self-heal] stripe lookup failed", err);
    return "stripe_down";
  }

  // A trialing subscription is "paid" with no charge; use status as a backstop.
  const looksPaid =
    PAID_STATUSES.has(session.payment_status) || session.status === "complete";
  if (!looksPaid) return "not_paid";

  const subscription = session.subscription;
  if (!subscription || typeof subscription === "string") {
    return "not_paid";
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (!customerId) return "not_paid";

  const subAny = subscription as unknown as {
    current_period_end?: number | null;
    trial_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> };
  };
  const periodEndUnix =
    subAny.current_period_end ??
    subAny.items?.data?.[0]?.current_period_end ??
    null;
  const trialEndUnix = subAny.trial_end ?? null;

  const { error } = await getSupabaseAdmin()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_end: unixToIso(periodEndUnix),
        trial_end: unixToIso(trialEndUnix),
      },
      { onConflict: "stripe_subscription_id" }
    );

  if (error) {
    // TODO(step-11): Sentry.captureException(error, { tags: { area: "self-heal" } });
    console.error("[self-heal] upsert failed", error);
    // Treat a DB write failure the same as Stripe-down — show the spinner
    // and re-run the gate. The webhook will still try to upsert separately.
    return "stripe_down";
  }

  return "success";
}

function unixToIso(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}
