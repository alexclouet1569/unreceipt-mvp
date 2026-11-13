// SERVER-ONLY. Ending a mailbox connection: stop push notifications and
// revoke the grant at the provider (both best effort, time-boxed), and
// delete our row. Used by DELETE /api/mailboxes/[id] and by deleteAccount()
// (src/lib/account-deletion.ts). Never logs tokens or addresses.
//
// When another account's ACTIVE connection uses the same address at the
// same provider, only our row goes: at Google the grant and the watch are
// shared by every connection of that mailbox (./shared-grant.ts), so a
// revoke or users.stop would cut the other account off too.

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { withTimeout } from "@/lib/with-timeout";
import { forgetAccessToken } from "./access-token";
import { getProvider } from "./providers";
import { WATCH_IS_PER_MAILBOX, addressInUse } from "./shared-grant";
import { deleteConnection, getDecryptedToken, listConnections } from "./store";
import type { MailboxConnectionRef } from "./types";

const PROVIDER_CALL_MS = 8000;
// Releasing every mailbox during account deletion, all together.
export const ACCOUNT_DELETE_BUDGET_MS = 20_000;

export type ReleaseResult = { stopped: boolean; revoked: boolean };

/**
 * Stops the watch (with a fresh access token) and revokes the grant. Never
 * throws: a provider that is down must not keep a connection alive on our
 * side, so failures go to Sentry and the caller deletes the row anyway.
 * `shared`: another active connection uses this mailbox; the grant is left
 * alone, and so is the watch where it is per mailbox (Gmail).
 */
export async function releaseAtProvider(
  conn: MailboxConnectionRef,
  refreshToken: string,
  opts: { shared?: boolean } = {},
): Promise<ReleaseResult> {
  const provider = getProvider(conn.provider);
  const result: ReleaseResult = { stopped: false, revoked: false };
  let tokenToRevoke = refreshToken;
  const shared = opts.shared === true;

  if ((conn.watch_id || conn.watch_expires_at) && !(shared && WATCH_IS_PER_MAILBOX[conn.provider])) {
    try {
      const fresh = await withTimeout("mailbox refresh", PROVIDER_CALL_MS, provider.refreshAccessToken(refreshToken));
      if (fresh.refreshToken) tokenToRevoke = fresh.refreshToken;
      await withTimeout("mailbox stopWatch", PROVIDER_CALL_MS, provider.stopWatch(conn, fresh.accessToken));
      result.stopped = true;
    } catch (err) {
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "stop_watch", provider: conn.provider } });
    }
  }

  if (shared) return result;
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
 * told, unless another active connection still uses the address. When
 * that can't be read the release goes ahead (the owner asked for it).
 * False when the row didn't exist (or belonged to someone else).
 */
export async function disconnectMailbox(
  conn: MailboxConnectionRef,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<{ deleted: boolean } & ReleaseResult> {
  const refreshToken = await readTokenQuietly(conn, supabase);
  const deleted = await deleteConnection(conn.id, conn.user_id, supabase);
  forgetAccessToken(conn.id);
  if (!deleted) return { deleted, stopped: false, revoked: false };
  if (!refreshToken) return { deleted, stopped: false, revoked: false };
  const use = await addressInUse(conn.provider, conn.email, { exceptConnectionId: conn.id, supabase });
  const released = await releaseAtProvider(conn, refreshToken, { shared: use === "in_use" });
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
  // All at once, within one overall budget: one after another, five slow
  // providers (three calls of up to 8 s each) would outlast the 60 s
  // /api/account/delete has. Anything still running after the budget is
  // left to the cascade with auth.users (the row) and to the provider's own
  // expiry (the watch); the deletion itself goes on.
  const all = Promise.allSettled(
    conns.map((conn) =>
      disconnectMailbox(conn, supabase).catch((err) => {
        Sentry.captureException(err, { tags: { area: "mailboxes", step: "account_delete", provider: conn.provider } });
      }),
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ACCOUNT_DELETE_BUDGET_MS);
  });
  const outcome = await Promise.race([all.then(() => "done" as const), budget]);
  if (timer) clearTimeout(timer);
  if (outcome === "timeout") {
    Sentry.captureMessage("mailbox release outlasted the account deletion budget", {
      level: "warning",
      tags: { area: "mailboxes", step: "account_delete_budget" },
    });
  }
  return conns.length;
}
