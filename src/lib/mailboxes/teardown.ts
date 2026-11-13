// SERVER-ONLY. Ending a mailbox connection: stop push notifications and
// revoke the grant at the provider (both best effort, time-boxed), and
// delete our row. Used by DELETE /api/mailboxes/[id] and by deleteAccount()
// (src/lib/account-deletion.ts). Never logs tokens or addresses.

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { withTimeout } from "@/lib/with-timeout";
import { forgetAccessToken } from "./access-token";
import { getProvider } from "./providers";
import { deleteConnection, getDecryptedToken, listConnections } from "./store";
import type { MailboxConnectionRef } from "./types";

const PROVIDER_CALL_MS = 8000;

export type ReleaseResult = { stopped: boolean; revoked: boolean };

/**
 * Stops the watch (with a fresh access token) and revokes the grant. Never
 * throws: a provider that is down must not keep a connection alive on our
 * side, so failures go to Sentry and the caller deletes the row anyway.
 */
export async function releaseAtProvider(conn: MailboxConnectionRef, refreshToken: string): Promise<ReleaseResult> {
  const provider = getProvider(conn.provider);
  const result: ReleaseResult = { stopped: false, revoked: false };
  let tokenToRevoke = refreshToken;

  if (conn.watch_id || conn.watch_expires_at) {
    try {
      const fresh = await withTimeout("mailbox refresh", PROVIDER_CALL_MS, provider.refreshAccessToken(refreshToken));
      if (fresh.refreshToken) tokenToRevoke = fresh.refreshToken;
      await withTimeout("mailbox stopWatch", PROVIDER_CALL_MS, provider.stopWatch(conn, fresh.accessToken));
      result.stopped = true;
    } catch (err) {
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "stop_watch", provider: conn.provider } });
    }
  }

  try {
    await withTimeout("mailbox revoke", PROVIDER_CALL_MS, provider.revoke(tokenToRevoke));
    result.revoked = true;
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "revoke", provider: conn.provider } });
  }
  return result;
}

async function readTokenQuietly(conn: MailboxConnectionRef, supabase: SupabaseClient): Promise<string | null> {
  try {
    return await getDecryptedToken(conn, supabase);
  } catch (err) {
    // Unreadable (key changed, row gone): nothing to revoke with; the row
    // is still deleted.
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "token_read", provider: conn.provider } });
    return null;
  }
}

/**
 * Disconnect one mailbox of its owner. The token is read first, then the
 * row is deleted (no new sync can start from it), then the provider is
 * told. False when the row didn't exist (or belonged to someone else).
 */
export async function disconnectMailbox(
  conn: MailboxConnectionRef,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<{ deleted: boolean } & ReleaseResult> {
  const refreshToken = await readTokenQuietly(conn, supabase);
  const deleted = await deleteConnection(conn.id, conn.user_id, supabase);
  forgetAccessToken(conn.id);
  if (!deleted) return { deleted, stopped: false, revoked: false };
  const released = refreshToken ? await releaseAtProvider(conn, refreshToken) : { stopped: false, revoked: false };
  return { deleted, ...released };
}

/**
 * Account deletion: release every mailbox of the user at its provider and
 * delete the rows. Never throws (the rows cascade with auth.users anyway);
 * returns how many connections were found.
 */
export async function disconnectAllMailboxes(
  userId: string,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<number> {
  let conns: MailboxConnectionRef[];
  try {
    conns = await listConnections(userId, supabase);
  } catch (err) {
    // Table not created yet, or a database blip: the cascade cleans up.
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "account_delete_list" } });
    return 0;
  }
  for (const conn of conns) {
    try {
      await disconnectMailbox(conn, supabase);
    } catch (err) {
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "account_delete", provider: conn.provider } });
    }
  }
  return conns.length;
}
