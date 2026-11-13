// SERVER-ONLY. One sync of one connection: fresh access token, the
// provider's sync, then the cursor moved by compare-and-set. Shared by the
// first backfill after connecting (callback route) and, from steps 3/4, the
// push routes and the daily job.
//
// Two syncs starting from the same cursor may both read the same messages;
// the ingest dedupes on the RFC Message-ID (receipts.intake_ref), and only
// one of them moves the cursor. Errors are recorded as a short code on the
// row and rethrown.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken } from "./access-token";
import { getProvider } from "./providers";
import { recordError, updateCursor } from "./store";
import {
  MailboxProviderError,
  ReauthRequiredError,
  type MailboxConnectionRef,
  type SyncOptions,
  type SyncResult,
} from "./types";

export type SyncOutcome =
  | ({ skipped: false; advanced: boolean } & SyncResult)
  | { skipped: true; reason: "not_active" };

export async function syncConnection(
  conn: MailboxConnectionRef,
  opts: SyncOptions = {},
  { supabase }: { supabase?: SupabaseClient } = {},
): Promise<SyncOutcome> {
  if (conn.status !== "active") return { skipped: true, reason: "not_active" };
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
