import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Webhook signature verification needs the raw request body. Force the
// Node.js runtime and disable any caching so the route always sees a
// fresh request body.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
};

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Stripe signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(extractFromSubscription(sub));
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription({
          ...extractFromSubscription(sub),
          status: "canceled",
        });
        break;
      }
      default:
        // Unknown / uninteresting event — acknowledge so Stripe stops retrying.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    // 500 → Stripe retries with exponential backoff. Our upsert is idempotent
    // (unique on stripe_subscription_id) so the retry is safe.
    return NextResponse.json({ error: "handler failure" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const subscriptionRef =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!userId || !customerId || !subscriptionRef) {
    // Subscription mode session without a subscription is a Stripe-side bug
    // — log and stop, no point retrying.
    console.error("checkout.session.completed missing required ids", {
      userId,
      customerId,
      subscriptionRef,
    });
    return;
  }

  const sub = await getStripe().subscriptions.retrieve(subscriptionRef);
  await upsertSubscription({
    ...extractFromSubscription(sub),
    user_id: userId,
    stripe_customer_id: customerId,
  });
}

function extractFromSubscription(sub: Stripe.Subscription): SubscriptionRow {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId =
    (sub.metadata && (sub.metadata.user_id as string | undefined)) ?? "";

  // The `current_period_end` lives on the first item in newer API versions.
  // Fall back across spellings so we handle every event shape Stripe emits.
  const subAny = sub as unknown as {
    current_period_end?: number | null;
    trial_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> };
  };
  const periodEndUnix =
    subAny.current_period_end ??
    subAny.items?.data?.[0]?.current_period_end ??
    null;
  const trialEndUnix = subAny.trial_end ?? null;

  return {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: unixToIso(periodEndUnix),
    trial_end: unixToIso(trialEndUnix),
  };
}

function unixToIso(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

async function upsertSubscription(row: SubscriptionRow) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });

  if (error) {
    throw new Error(`subscriptions upsert failed: ${error.message}`);
  }
}
