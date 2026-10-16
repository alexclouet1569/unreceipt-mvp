// SERVER-ONLY (service role). Deletes Gmail forwarding confirmation codes
// older than CONFIRMATION_MAX_AGE_MS: the guide no longer offers them, and
// the Gmail address stored with them is personal data we don't need.
// Run daily from /api/cron/cleanup-exports.

import { getSupabaseAdmin } from "./supabase-admin";
import { CONFIRMATION_MAX_AGE_MS } from "./forwarding-confirmation";

export async function cleanupForwardingConfirmations(now: Date = new Date()): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - CONFIRMATION_MAX_AGE_MS).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("email_forwarding_confirmations")
    .delete()
    .lt("received_at", cutoff)
    .select("user_id");
  if (error) throw new Error(`forwarding confirmation cleanup failed: ${error.code ?? "unknown"}`);
  return { deleted: data?.length ?? 0 };
}
