// SERVER-ONLY (service role). Deletes demo requests older than
// DEMO_REQUEST_MAX_AGE_DAYS: the privacy page promises we keep what the demo
// form collects (name, company, email, phone) for 12 months at most.
// Run daily from /api/cron/cleanup-exports.

import { getSupabaseAdmin } from "./supabase-admin";

export const DEMO_REQUEST_MAX_AGE_DAYS = 365;

export async function cleanupDemoRequests(now: Date = new Date()): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - DEMO_REQUEST_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("demo_requests")
    .delete()
    .lt("created_at", cutoff)
    .select("id");
  if (error) throw new Error(`demo request cleanup failed: ${error.code ?? "unknown"}`);
  return { deleted: data?.length ?? 0 };
}
