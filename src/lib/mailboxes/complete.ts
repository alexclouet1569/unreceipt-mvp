// SERVER-ONLY. The one place a freshly authorised mailbox is saved, shared
// by the website's OAuth callback (/api/mailboxes/callback/[provider]) and
// the iPhone app's claim (/api/mailboxes/claim), so the two can't drift:
//
//   1. store it (saveConnection: re-connecting an address replaces its
//      token; a new address is refused past CONNECTION_LIMIT, and the grant
//      it came with is then revoked, since we won't keep it);
//   2. start push notifications (a failure doesn't undo the connection:
//      the daily job starts the watch again);
//   3. queue the first 30-day backfill with after(), within the caller's
//      function budget.
//
// The caller has already decided WHO the mailbox belongs to (the website's
// session, or the app's bearer matching the parked grant). Never logs the
// tokens or the address.

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/with-timeout";
import { forgetAccessToken, getAccessToken, primeAccessToken } from "./access-token";
import { BACKFILL } from "./oauth";
import { recordError, saveConnection, updateWatch } from "./store";
import { syncConnection } from "./sync";
import { ReauthRequiredError, type MailboxConnectionRef, type MailboxProvider } from "./types";

const REVOKE_MS = 8000;
// Leave this much of the function's budget for saving the backfill's cursor.
const BACKFILL_MARGIN_MS = 20_000;

export type CompleteResult =
  | { ok: true; conn: MailboxConnectionRef; created: boolean }
  | { ok: false; reason: "limit" | "invalid_email" | "server_error" };

export async function completeConnection(input: {
  provider: MailboxProvider;
  userId: string;
  email: string;
  refreshToken: string;
  /** The access token from the code exchange, when still at hand (website). */
  accessToken?: { token: string; expiresAt: number } | null;
  /** When the request started (epoch ms) and its maxDuration, for the backfill. */
  startedAt: number;
  maxDurationSeconds: number;
  supabase: SupabaseClient;
}): Promise<CompleteResult> {
  const { provider, supabase } = input;

  let conn: MailboxConnectionRef;
  let created: boolean;
  try {
    const saved = await saveConnection(
      { userId: input.userId, provider: provider.id, email: input.email, refreshToken: input.refreshToken },
      supabase,
    );
    if (!saved.ok) {
      // Not stored, so not kept at the provider either.
      await withTimeout("mailbox revoke", REVOKE_MS, provider.revoke(input.refreshToken)).catch(() => {});
      return { ok: false, reason: saved.error };
    }
    conn = saved.conn;
    created = saved.created;
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "save", provider: provider.id } });
    return { ok: false, reason: "server_error" };
  }

  forgetAccessToken(conn.id);
  if (input.accessToken) primeAccessToken(conn.id, input.accessToken.token, input.accessToken.expiresAt);

  try {
    // Without the exchange's token (the app's claim, minutes later) this
    // refreshes it, storing a rotated refresh token (Microsoft).
    const accessToken = input.accessToken?.token ?? (await getAccessToken(conn, { supabase }));
    const watch = await provider.startWatch(conn, accessToken);
    await updateWatch(conn.id, watch, supabase);
    conn = {
      ...conn,
      watch_id: watch.watchId,
      watch_expires_at: watch.expiresAt,
      cursor: watch.cursor ?? conn.cursor,
    };
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      // getAccessToken marked the row needs_reconnect: no backfill either.
      conn = { ...conn, status: "needs_reconnect" };
    } else {
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "start_watch", provider: provider.id } });
      await recordError(conn.id, "watch_failed", supabase).catch(() => {});
    }
  }

  const backfillFor = conn;
  const deadline = input.startedAt + input.maxDurationSeconds * 1000 - BACKFILL_MARGIN_MS;
  after(async () => {
    try {
      await syncConnection(backfillFor, { ...BACKFILL, deadline }, { supabase });
    } catch (err) {
      if (!(err instanceof ReauthRequiredError)) {
        Sentry.captureException(err, { tags: { area: "mailboxes", step: "backfill", provider: backfillFor.provider } });
      }
    }
  });

  return { ok: true, conn, created };
}
