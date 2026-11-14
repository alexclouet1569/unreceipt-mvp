// SERVER-ONLY. One sync of one connection: fresh access token, the
// provider's sync, then the cursor moved by compare-and-set. Shared by the
// first backfill after connecting (complete.ts), the push routes and the
// daily job.
//
// Only while the user has product access (hasProductAccess(), the same gate
// as /api/ocr; pilot mode and a database error allow): without it the
// connection is set 'paused' and nothing is read; the screens say so. A
// paused connection is resumed ('active') by the next sync asked for it
// once access is back (the daily job lists paused ones too, and a push
// finds them), and then reads from its cursor as usual.
//
// Two syncs starting from the same cursor may both read the same messages;
// the ingest dedupes on the RFC Message-ID (receipts.intake_ref), and only
// one of them moves the cursor. Errors are recorded as a short code on the
// row and rethrown.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasProductAccess } from "@/lib/subscription-gate";
import { getAccessToken } from "./access-token";
import { getProvider } from "./providers";
import { recordError, setPaused, updateCursor } from "./store";
import {
  MailboxProviderError,
  ReauthRequiredError,
  type MailboxConnectionRef,
  type SyncOptions,
  type SyncResult,
} from "./types";

export type SyncOutcome =
  | ({ skipped: false; advanced: boolean } & SyncResult)
  | { skipped: true; reason: "not_active" | "paused" };

/**
 * Pauses or resumes the connection by its user's access. Returns the
 * connection to sync (status 'active'), or null when it is (now) paused or
 * neither active nor paused.
 */
export async function reconcileAccess(
  conn: MailboxConnectionRef,
  { supabase, access: known }: { supabase?: SupabaseClient; access?: boolean } = {},
): Promise<MailboxConnectionRef | null> {
  if (conn.status !== "active" && conn.status !== "paused") return null;
  const access = known ?? (await hasProductAccess(conn.user_id));
  if (!access) {
    if (conn.status === "active") await setPaused(conn.id, true, supabase);
    return null;
  }
  if (conn.status === "paused") {
    // Compare-and-set: a needs_reconnect set meanwhile is not overwritten.
    // When another sync resumed it first, that one reads the mail.
    if (!(await setPaused(conn.id, false, supabase))) return null;
    return { ...conn, status: "active" };
  }
  return conn;
}

export async function syncConnection(
  conn: MailboxConnectionRef,
  opts: SyncOptions = {},
  { supabase }: { supabase?: SupabaseClient } = {},
): Promise<SyncOutcome> {
  if (conn.status !== "active" && conn.status !== "paused") return { skipped: true, reason: "not_active" };
  const live = await reconcileAccess(conn, { supabase });
  if (!live) return { skipped: true, reason: "paused" };
  conn = live;
  const provider = getProvider(conn.provider);
  try {
    const accessToken = await getAccessToken(conn, { supabase });
    const result = await provider.sync(conn, accessToken, opts);
    const now = new Date().toISOString();
    const advanced = await updateCursor(
      conn.id,
      conn.cursor,
      result.cursor ?? conn.cursor,
      { lastReceiptAt: result.created > 0 ? now : null, now },
      supabase,
    );
    return { skipped: false, advanced, ...result };
  } catch (err) {
    // ReauthRequiredError already marked the row needs_reconnect.
    if (!(err instanceof ReauthRequiredError)) {
      const code = err instanceof MailboxProviderError ? err.code : "sync_failed";
      await recordError(conn.id, code, supabase).catch(() => {});
    }
    throw err;
  }
}
