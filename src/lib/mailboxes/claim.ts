// SERVER-ONLY. A short claim on one message of one connection, so two syncs
// running at once (two push notifications seconds apart, a Pub/Sub
// redelivery, the daily job) don't both download the same receipt and pay
// for its Claude reads before either has inserted it. The cursor's
// compare-and-set (store.ts) only keeps them from both moving the cursor.
//
// Built on public.rate_limit_hit (one hit allowed per window), keyed by a
// hash: the message id itself is never stored. A sync that finds a message
// claimed stops before it and keeps its cursor there, so nothing is skipped:
// the claimant reads it, or a later sync does once the window has passed
// (the ingest's dedupe then makes it a no-op). Fails open: a counter error
// lets the read go ahead.

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** Long enough for one ingest (two Claude calls, uploads, the insert). */
export const CLAIM_WINDOW_SECONDS = 300;

export async function claimMessage(connectionId: string, providerMessageId: string): Promise<boolean> {
  const hash = createHash("sha256").update(`${connectionId}:${providerMessageId}`).digest("hex").slice(0, 40);
  try {
    const { data, error } = await getSupabaseAdmin().rpc("rate_limit_hit", {
      p_key: `mailboxMsg:${CLAIM_WINDOW_SECONDS}:${hash}`,
      p_window_seconds: CLAIM_WINDOW_SECONDS,
      p_limit: 1,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
