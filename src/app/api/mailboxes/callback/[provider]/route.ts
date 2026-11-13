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
// the code, store the mailbox (re-connecting an address replaces its token;
// a new one is refused past 5), start push notifications, and queue the
// first 30-day backfill with after().
//
// The browser ends on a fixed page: /app/settings?mailbox=… on the website,
// unreceipt://mailboxes?status=… in the iPhone app. Never a target from the
// request. Never logs the code, tokens or the address.
//
// The same address may be connected by two different UnReceipt users:
// a mailbox belongs to whoever authorised it on the provider's screen.

import * as Sentry from "@sentry/nextjs";
import { after, NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { forgetAccessToken, primeAccessToken } from "@/lib/mailboxes/access-token";
import {
  bindingCookieName,
  bindingCookieOptions,
  bindingMatches,
  BACKFILL,
  providerErrorReason,
  redirectUri,
  resultUrl,
  takePending,
  type OAuthClient,
  type ResultReason,
} from "@/lib/mailboxes/oauth";
import { configuredProvider } from "@/lib/mailboxes/providers";
import { noStore } from "@/lib/mailboxes/start-flow";
import { recordError, saveConnection, updateWatch } from "@/lib/mailboxes/store";
import { syncConnection } from "@/lib/mailboxes/sync";
import { MissingScopeError, ReauthRequiredError, type MailboxConnectionRef } from "@/lib/mailboxes/types";
import { withTimeout } from "@/lib/with-timeout";

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

  const finish = (client: OAuthClient, outcome: { status: "connected" } | { status: "error"; reason: ResultReason }) => {
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
    // Not an error on our side: the user granted sign-in but not mail.
    if (err instanceof MissingScopeError) return fail(client, "scope_missing");
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "exchange", provider: provider.id } });
    return fail(client, "exchange_failed");
  }

  let conn: MailboxConnectionRef;
  try {
    const saved = await saveConnection(
      { userId: pending.user_id, provider: provider.id, email: tokens.email, refreshToken: tokens.refreshToken },
      supabase,
    );
    if (!saved.ok) {
      // Not stored, so not kept at the provider either.
      await withTimeout("mailbox revoke", 8000, provider.revoke(tokens.refreshToken)).catch(() => {});
      return fail(client, saved.error === "limit" ? "limit" : "exchange_failed");
    }
    conn = saved.conn;
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "save", provider: provider.id } });
    return fail(client, "server_error");
  }

  forgetAccessToken(conn.id);
  primeAccessToken(conn.id, tokens.accessToken, tokens.expiresAt);

  // Push notifications. A failure doesn't undo the connection: the daily
  // job starts the watch again.
  try {
    const watch = await provider.startWatch(conn, tokens.accessToken);
    await updateWatch(conn.id, watch, supabase);
    conn = {
      ...conn,
      watch_id: watch.watchId,
      watch_expires_at: watch.expiresAt,
      cursor: watch.cursor ?? conn.cursor,
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "start_watch", provider: provider.id } });
    await recordError(conn.id, "watch_failed", supabase).catch(() => {});
  }

  const backfillFor = conn;
  after(async () => {
    try {
      // Stops in time to save its cursor inside maxDuration.
      await syncConnection(backfillFor, { ...BACKFILL, deadline: startedAt + (maxDuration - 20) * 1000 }, { supabase });
    } catch (err) {
      if (!(err instanceof ReauthRequiredError)) {
        Sentry.captureException(err, { tags: { area: "mailboxes", step: "backfill", provider: backfillFor.provider } });
      }
    }
  });

  return finish(client, { status: "connected" });
}
