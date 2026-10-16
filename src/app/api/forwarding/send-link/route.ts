// POST /api/forwarding/send-link — emails the caller (their sign-in address
// only) a link to the forwarding setup, for someone who opened it on a
// phone: Gmail and Outlook rules can only be made in a browser on a
// computer. Rate-limited per user because it sends email.

import { NextResponse, type NextRequest } from "next/server";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { forwardingSetupEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_URL_FALLBACK = "https://app.unreceipt.com";

export async function POST(request: NextRequest) {
  // Same-origin only: browsers always send Origin on cross-site POSTs.
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Only to an inbox the user has proved they own.
  if (!user.email || !user.email_confirmed_at) {
    return NextResponse.json({ error: "Confirm your email address first." }, { status: 400 });
  }

  const limited = await rateLimit("forwardingLink", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  const url = `${base && base.startsWith("http") ? base : PRODUCT_URL_FALLBACK}/app/settings/forwarding`;
  const content = forwardingSetupEmail({ url });
  const result = await sendEmail({ to: user.email, ...content, tag: "forwarding_setup" });
  if (!result.ok) {
    return NextResponse.json({ error: "Couldn't send the email. Try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: user.email });
}
