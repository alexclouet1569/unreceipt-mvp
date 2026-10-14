import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import {
  MAX_EMPLOYEES,
  MIN_EMPLOYEES,
  PLAN_IDS,
  planPriceEnv,
} from "@/lib/plans";

// The customer picks a plan and how many employees file receipts; the
// subscription is that plan's per-employee price × employees.
const CheckoutBody = z.object({
  plan: z.enum(PLAN_IDS),
  employees: z.number().int().min(MIN_EMPLOYEES).max(MAX_EMPLOYEES),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = CheckoutBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Pick a plan and a number of employees." },
      { status: 400 }
    );
  }
  const { plan, employees } = parsed.data;

  // No fallback to another price: a missing env var must fail loudly
  // rather than bill the customer for a plan they didn't choose.
  const priceId = process.env[planPriceEnv(plan)];
  if (!priceId) {
    console.error(`Checkout: ${planPriceEnv(plan)} is not set`);
    return NextResponse.json(
      { error: "This plan isn't available yet. Please contact us." },
      { status: 500 }
    );
  }

  // Prefer NEXT_PUBLIC_APP_URL so success/cancel always land on the
  // canonical product host (app.unreceipt.com) regardless of which
  // host received the POST. Falls back to the request origin for
  // local dev where the env var is unset.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.length > 0
      ? process.env.NEXT_PUBLIC_APP_URL
      : request.nextUrl.origin;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: employees }],
      // metadata.user_id rides on the subscription itself so the
      // customer.subscription.updated / .deleted webhooks know whose row
      // to update (client_reference_id only exists on the Checkout session).
      subscription_data: {
        trial_period_days: 7,
        metadata: { user_id: user.id, plan },
      },
      client_reference_id: user.id,
      customer_email: user.email,
      // Stripe Tax: charge VAT automatically based on the customer's
      // billing address. Requires F-tax / VAT registration in the
      // Stripe Dashboard (Tax → Registrations) for the relevant
      // jurisdictions; until that's configured Stripe simply doesn't
      // collect tax for non-registered regions, which is fine.
      automatic_tax: { enabled: true },
      // billing_address_collection: "required" is implied when
      // automatic_tax is enabled — Stripe needs the address to compute
      // the correct rate.
      // {CHECKOUT_SESSION_ID} is a Stripe placeholder — substituted at
      // redirect time so /app can self-heal the subscription record (plan A4).
      success_url: `${origin}/app?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe?canceled=1`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Couldn't start checkout. Try again." },
      { status: 502 }
    );
  }
}
