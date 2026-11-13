// SERVER-ONLY. One mailbox address can be connected by more than one
// UnReceipt account (two people sharing an inbox, or an owner and their
// bookkeeper). At Google they share ONE grant: a refresh token belongs to
// the (Google account, our OAuth client) pair, so revoking any of them
// revokes them all, and users.stop ends the mailbox's one watch for every
// connection. So before we revoke a grant or stop a watch for an address,
// we ask whether another ACTIVE connection still uses that (provider,
// address): if so, we leave the provider alone and only delete our own
// copy (row, parked grant).
//
// Microsoft has no per-token revoke (revoke() does nothing) and each Graph
// subscription is its own (stopWatch deletes ours only), so only Google's
// watch is per mailbox (WATCH_IS_PER_MAILBOX).
//
// Never logs the address.

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/with-timeout";
import { findActiveConnectionsByEmail } from "./store";
import type { MailboxProvider, MailboxProviderId } from "./types";

const REVOKE_MS = 8000;

/** Whether stopping push for one connection stops it for the whole mailbox. */
export const WATCH_IS_PER_MAILBOX: Record<MailboxProviderId, boolean> = {
  google: true,
  microsoft: false,
};

export type AddressUse = "in_use" | "free" | "unknown";

/**
 * Whether an active connection (anyone's) other than `exceptConnectionId`
 * uses this address at this provider. "unknown" on a database error; each
 * caller decides what that means for it.
 */
export async function addressInUse(
  provider: MailboxProviderId,
  email: string,
  opts: { exceptConnectionId?: string; supabase?: SupabaseClient } = {},
): Promise<AddressUse> {
  try {
    const conns = await findActiveConnectionsByEmail(provider, email, opts.supabase);
    return conns.some((c) => c.id !== opts.exceptConnectionId) ? "in_use" : "free";
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "address_in_use", provider } });
    return "unknown";
  }
}

/**
 * Revokes a grant we will never keep (refused, expired, not parked), unless
 * the address is connected by someone: revoking would end their grant too.
 * When that can't be read, the grant is kept: our copy is gone anyway, and
 * breaking someone's working mailbox is the worse mistake. Best effort,
 * time-boxed, never throws.
 */
export async function revokeUnusedGrant(
  provider: MailboxProvider,
  email: string,
  refreshToken: string,
  supabase?: SupabaseClient,
): Promise<"revoked" | "kept" | "failed"> {
  if ((await addressInUse(provider.id, email, { supabase })) !== "free") return "kept";
  try {
    await withTimeout("mailbox revoke", REVOKE_MS, provider.revoke(refreshToken));
    return "revoked";
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "unused_revoke", provider: provider.id } });
    return "failed";
  }
}
