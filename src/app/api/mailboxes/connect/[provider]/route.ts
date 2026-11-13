// GET/POST /api/mailboxes/connect/<google|microsoft> — starts "Connect
// Gmail" / "Connect Outlook" (src/lib/mailboxes/).
//
// Two ways in:
//  - Website: GET with the user's cookie session. The explainer screen
//    (step 5) links here; the session is the user's own, so it goes
//    straight on to the provider.
//  - iPhone app: GET ?link=<token> from POST /api/mailboxes/connect-link,
//    opened in the system sign-in sheet (no session there). It never goes
//    straight to Google/Microsoft: it shows a confirmation page naming the
//    UnReceipt account, whose Continue button POSTs here (same origin
//    required), and only that POST starts the flow. Otherwise anyone could
//    send a victim a link that connects the victim's mailbox to the
//    sender's account.
//
// Starting a flow: rate limit, the 5-mailbox cap, a pending row (state +
// PKCE), an HttpOnly binding cookie, then 303 to the consent screen
// (src/lib/mailboxes/start-flow.ts). Unknown or unconfigured provider: 404.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { absoluteAppUrl } from "@/lib/app-url";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PAGE_CSP, confirmPageHtml, continuePageHtml } from "@/lib/mailboxes/confirm-page";
import { linkSecretConfigured, verifyConnectLink, type LinkFailure } from "@/lib/mailboxes/link-token";
import { maskAddress, type ResultReason } from "@/lib/mailboxes/oauth";
import { configuredProvider } from "@/lib/mailboxes/providers";
import { finishWith, noStore, startConnectFlow } from "@/lib/mailboxes/start-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string }> };

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

const linkReason = (failure: LinkFailure): ResultReason =>
  failure.reason === "expired" ? "link_expired" : "link_invalid";

export async function GET(request: NextRequest, { params }: Ctx) {
  const provider = configuredProvider((await params).provider);
  if (!provider) return notFound();

  const link = request.nextUrl.searchParams.get("link");
  if (link !== null) {
    if (!linkSecretConfigured()) return notFound();
    const verified = verifyConnectLink(link, provider.id);
    if (!verified.ok) return finishWith("app", linkReason(verified));

    // Name the account the mailbox will land in.
    const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(verified.userId);
    if (error || !data?.user) return finishWith("app", "link_invalid");

    const html = confirmPageHtml({
      provider: provider.id,
      maskedAccount: maskAddress(data.user.email),
      linkToken: link,
    });
    const res = new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": PAGE_CSP,
      },
    });
    return noStore(res);
  }

  const user = await getServerUser();
  if (!user) {
    return noStore(NextResponse.redirect(absoluteAppUrl("/app/login?next=/app/settings"), 303));
  }
  return startConnectFlow({ provider, userId: user.id, client: "web" });
}

/**
 * A redirect answer turned into a page that moves on by itself: the site's
 * CSP `form-action 'self'` also covers redirects after a form POST, so a
 * 303 to the provider (or to unreceipt://) would be blocked. Cookies set on
 * the redirect (the binding cookie) are kept.
 */
function asContinuePage(redirect: NextResponse): NextResponse {
  const target = redirect.headers.get("location");
  if (!target) return redirect;
  const page = new NextResponse(continuePageHtml(target), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PAGE_CSP },
  });
  for (const cookie of redirect.cookies.getAll()) page.cookies.set(cookie);
  return noStore(page);
}

// The confirmation page's Continue button (iPhone app link only).
export async function POST(request: NextRequest, { params }: Ctx) {
  const provider = configuredProvider((await params).provider);
  if (!provider || !linkSecretConfigured()) return notFound();

  // Required, not optional: this POST carries no session of its own, so a
  // page elsewhere must not be able to submit someone else's link for them.
  const origin = request.headers.get("origin");
  if (!origin || !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let link: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("link");
    link = typeof value === "string" ? value : null;
  } catch {
    link = null;
  }
  const verified = verifyConnectLink(link, provider.id);
  if (!verified.ok) return asContinuePage(finishWith("app", linkReason(verified)));

  try {
    return asContinuePage(
      await startConnectFlow({
        provider,
        userId: verified.userId,
        client: "app",
        linkJti: verified.jti,
      }),
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "connect_app" } });
    return asContinuePage(finishWith("app", "server_error"));
  }
}
