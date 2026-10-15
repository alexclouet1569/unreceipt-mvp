import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  hasOverageItem,
  periodStartFromSubscription,
  planFromSubscription,
} from "@/lib/stripe-plan";

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
  plan: string | null;
  overage_enabled: boolean;
  current_period_start: string | null;
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
        // Stripe doesn't guarantee delivery order, so a late or retried
        // event can carry an old state (e.g. "active" arriving after the
        // cancellation). Write what Stripe says *now*, not the payload.
        const eventSub = event.data.object as Stripe.Subscription;
        const sub = await getStripe().subscriptions.retrieve(eventSub.id);
        const row = await withResolvedUser(extractFromSubscription(sub));
        if (row) await upsertSubscription(row);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const row = await withResolvedUser(extractFromSubscription(sub));
        if (row) await upsertSubscription({ ...row, status: "canceled" });
        break;
      }
      default:
        // Unknown / uninteresting event — acknowledge so Stripe stops retrying.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    Sentry.captureException(err, { tags: { area: "stripe-webhook", event: event.type } });
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
    plan: planFromSubscription(sub),
    overage_enabled: hasOverageItem(sub),
    current_period_start: periodStartFromSubscription(sub),
    current_period_end: unixToIso(periodEndUnix),
    trial_end: unixToIso(trialEndUnix),
  };
}

function unixToIso(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

// Subscriptions created before Checkout stamped metadata.user_id carry no
// user id. Fall back to the row checkout.session.completed already wrote
// for the same customer. If there is none yet (subscription.created can
// arrive before checkout.session.completed), skip — the checkout handler
// writes the row with the user id from client_reference_id.
async function withResolvedUser(
  row: SubscriptionRow
): Promise<SubscriptionRow | null> {
  if (row.user_id) return row;

  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", row.stripe_customer_id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`subscriptions lookup failed: ${error.message}`);
  }
  if (!data?.user_id) {
    console.warn("[stripe webhook] no user for customer yet, skipping", {
      customer: row.stripe_customer_id,
      subscription: row.stripe_subscription_id,
    });
    return null;
  }
  return { ...row, user_id: data.user_id as string };
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
