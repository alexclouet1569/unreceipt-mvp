// SERVER-ONLY. A fresh access token for a connected mailbox. Access tokens
// live in memory only (this instance, until a minute before they expire);
// only the encrypted refresh token is stored.
//
// A rotated refresh token is stored at once. When the provider says the
// grant is gone (ReauthRequiredError) the connection is marked
// needs_reconnect and the error is rethrown, so callers stop.

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProvider } from "./providers";
import { getDecryptedToken, markNeedsReconnect, replaceRefreshToken } from "./store";
import { ReauthRequiredError, type MailboxConnectionRef } from "./types";

const EARLY_MS = 60 * 1000;
const cache = new Map<string, { token: string; expiresAt: number }>();

/** Seeds the cache with the token the code exchange just returned. */
export function primeAccessToken(connId: string, token: string, expiresAt: number): void {
  if (expiresAt - EARLY_MS > Date.now()) cache.set(connId, { token, expiresAt });
}

/** Forget a connection's cached token (disconnect, reconnect). */
export function forgetAccessToken(connId: string): void {
  cache.delete(connId);
}

export async function getAccessToken(
  conn: MailboxConnectionRef,
  { supabase, now = Date.now() }: { supabase?: SupabaseClient; now?: number } = {},
): Promise<string> {
  const hit = cache.get(conn.id);
  if (hit && hit.expiresAt - EARLY_MS > now) return hit.token;
  cache.delete(conn.id);

  const provider = getProvider(conn.provider);
  const refreshToken = await getDecryptedToken(conn, supabase);
  let refreshed;
  try {
    refreshed = await provider.refreshAccessToken(refreshToken);
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      try {
        await markNeedsReconnect(conn.id, "reauth_required", supabase);
      } catch (markErr) {
        Sentry.captureException(markErr, { tags: { area: "mailboxes", step: "mark_reconnect" } });
      }
    }
    throw err;
  }

  if (refreshed.refreshToken && refreshed.refreshToken !== refreshToken) {
    // Microsoft may invalidate the old token once a new one is issued, so a
    // failed save is reported: the next refresh may need a reconnect.
    try {
      await replaceRefreshToken(conn, refreshed.refreshToken, supabase);
    } catch (err) {
      console.error("[mailboxes] rotated refresh token not saved", conn.provider);
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "token_rotate", provider: conn.provider } });
    }
  }
  primeAccessToken(conn.id, refreshed.accessToken, refreshed.expiresAt);
  return refreshed.accessToken;
}
