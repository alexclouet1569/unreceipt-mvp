// POST /api/billing/portal — opens the Stripe customer portal for the
// signed-in customer: change plan, update the card, download invoices or
// cancel ("Cancel anytime" on /subscribe). The portal's options (cancel,
// plan switching, invoice history) are set in the Stripe Dashboard →
// Settings → Billing → Customer portal; without that configuration Stripe
// refuses to create a session and this route answers 502.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { billingReturnUrl, loadBillingAccount } from "@/lib/stripe-billing";
import { getNativeApp } from "@/lib/native-app-server";
import { isSameHost } from "@/lib/same-origin";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // The store apps point to no purchase management (App Store 3.1.3(f)),
  // like /api/checkout.
  if (await getNativeApp()) {
    return NextResponse.json({ error: "Billing isn't available in the app." }, { status: 403 });
  }

  // Same-origin only: browsers always send Origin on cross-site POSTs.
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit("billingPortal", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  let customerId: string | null;
  try {
    customerId = (await loadBillingAccount(user.id)).customerId;
  } catch (err) {
    console.error("[billing/portal] subscriptions lookup failed", err);
    Sentry.captureException(err, { tags: { area: "billing-portal" } });
    return NextResponse.json({ error: "Couldn't open billing. Try again in a moment." }, { status: 503 });
  }
  if (!customerId) {
    return NextResponse.json({ error: "There's no billing on this account yet." }, { status: 404 });
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: billingReturnUrl(),
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] Stripe portal session failed", err);
    Sentry.captureException(err, { tags: { area: "billing-portal" } });
    return NextResponse.json({ error: "Couldn't open billing. Try again in a moment." }, { status: 502 });
  }
}
