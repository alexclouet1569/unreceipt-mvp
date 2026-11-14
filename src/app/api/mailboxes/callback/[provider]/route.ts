// GET /api/mailboxes/callback/<google|microsoft> — where Google's or
// Microsoft's consent screen sends the browser back (?code&state, or
// ?error). Registered as the OAuth redirect URI.
//
// In order: take the pending row for `state` out of the table (single use,
// even when two callbacks race); refuse an expired one, one for another
// provider, and one started in another browser (binding cookie); on the
// website also require the signed-in user to be the one who started it.
// A refusal on the provider's screen (access_denied, or a Microsoft tenant
// that needs its admin's consent) ends with a clear reason. Then exchange
// the code.
//
// Website: save the mailbox, start push and queue the first 30-day backfill
// (completeConnection(), src/lib/mailboxes/complete.ts).
//
// iPhone app: NEVER saved here. The sign-in sheet has no session, so nothing
// proves the person who approved is the user who minted the connect link.
// The grant is parked (src/lib/mailboxes/parked.ts) and the browser goes to
// unreceipt://mailboxes?status=claim&code=<one-time code>&provider=<id>; the
// app then claims it with its own sign-in (POST /api/mailboxes/claim), which
// only the link's user can do.
//
// The browser ends on a fixed page: /app/settings?mailbox=… on the website,
// unreceipt://mailboxes?status=… in the iPhone app. Never a target from the
// request. Never logs the code, tokens or the address.
//
// The same address may be connected by two different UnReceipt users:
// a mailbox belongs to whoever authorised it on the provider's screen.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { completeConnection } from "@/lib/mailboxes/complete";
import {
  bindingCookieName,
  bindingCookieOptions,
  bindingMatches,
  exchangeErrorReason,
  providerErrorReason,
  redirectUri,
  resultUrl,
  takePending,
  type FlowOutcome,
  type OAuthClient,
  type ResultReason,
} from "@/lib/mailboxes/oauth";
import { parkGrant } from "@/lib/mailboxes/parked";
import { configuredProvider } from "@/lib/mailboxes/providers";
import { revokeUnusedGrant } from "@/lib/mailboxes/shared-grant";
import { noStore } from "@/lib/mailboxes/start-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The first backfill runs in after() within this budget; the provider's
// sync stops at maxMessages and the daily job picks up the rest.
export const maxDuration = 300;

type Ctx = { params: Promise<{ provider: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const startedAt = Date.now();
  const provider = configuredProvider((await params).provider);
  if (!provider) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const search = request.nextUrl.searchParams;
  const state = search.get("state") ?? "";
  const cookieName = state ? bindingCookieName(state) : null;

  const finish = (client: OAuthClient, outcome: FlowOutcome) => {
    const res = noStore(NextResponse.redirect(resultUrl(client, outcome), 303));
    if (cookieName) res.cookies.set(cookieName, "", bindingCookieOptions(0));
    return res;
  };
  const fail = (client: OAuthClient, reason: ResultReason) => finish(client, { status: "error", reason });

  const supabase = getSupabaseAdmin();
  const taken = await takePending(supabase, state);
  if (!taken.ok) {
    Sentry.captureMessage("mailbox pending lookup failed", { tags: { area: "mailboxes", step: "pending_take" } });
    return fail("web", "server_error");
  }
  const pending = taken.row;
  // Unknown or already used: we can't tell which client asked, so the
  // website's page answers.
  if (!pending) return fail("web", "invalid_state");
  const client: OAuthClient = pending.client === "app" ? "app" : "web";

  if (pending.provider !== provider.id) return fail(client, "invalid_state");
  if (Date.parse(pending.expires_at) <= Date.now()) return fail(client, "expired");
  if (!bindingMatches(request.cookies.get(cookieName!)?.value, pending.browser_binding)) {
    return fail(client, "wrong_browser");
  }
  if (client === "web") {
    const user = await getServerUser();
    if (!user || user.id !== pending.user_id) return fail(client, "wrong_account");
  }

  const providerError = search.get("error");
  if (providerError) return fail(client, providerErrorReason(providerError, search.get("error_description")));

  const code = search.get("code");
  if (!code || code.length > 4096) return fail(client, "exchange_failed");

  let tokens;
  try {
    tokens = await provider.exchangeCode({
      code,
      codeVerifier: pending.code_verifier,
      redirectUri: redirectUri(provider.id),
    });
  } catch (err) {
    // Not errors on our side: the user granted sign-in but not mail, or a
    // Microsoft account has no mailbox to read.
    const known = exchangeErrorReason(err);
    if (known) return fail(client, known);
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "exchange", provider: provider.id } });
    return fail(client, "exchange_failed");
  }

  if (client === "app") {
    let reason: ResultReason;
    try {
      const parked = await parkGrant(supabase, {
        userId: pending.user_id,
        provider: provider.id,
        email: tokens.email,
        refreshToken: tokens.refreshToken,
      });
      if (parked.ok) return finish(client, { status: "claim", code: parked.code, provider: provider.id });
      reason = "exchange_failed";
    } catch (err) {
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "park", provider: provider.id } });
      reason = "server_error";
    }
    // Not parked, so not kept at the provider either (unless the address is
    // someone's working connection: the grant is shared).
    await revokeUnusedGrant(provider, tokens.email, tokens.refreshToken, supabase);
    return fail(client, reason);
  }

  const done = await completeConnection({
    provider,
    userId: pending.user_id,
    email: tokens.email,
    refreshToken: tokens.refreshToken,
    accessToken: { token: tokens.accessToken, expiresAt: tokens.expiresAt },
    startedAt,
    maxDurationSeconds: maxDuration,
    supabase,
  });
  if (!done.ok) {
    return fail(client, done.reason === "limit" ? "limit" : done.reason === "invalid_email" ? "exchange_failed" : "server_error");
  }
  return finish(client, { status: "connected" });
}
