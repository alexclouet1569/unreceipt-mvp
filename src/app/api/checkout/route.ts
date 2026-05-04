import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "Stripe price not configured" },
      { status: 500 }
    );
  }

  const origin = request.nextUrl.origin;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
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
