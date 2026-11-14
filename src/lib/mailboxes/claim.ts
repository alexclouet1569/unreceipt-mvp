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

/**
 * How often one message may answer "retry" (nothing saved: a storage or
 * database failure) before a sync gives up on it. A retry stops the sync
 * before the message so the next one reads it again; a message that can
 * never be stored (too big for storage, a file the bucket refuses) would
 * otherwise hold the mailbox's cursor forever and no later receipt would
 * arrive. After this many retries within RETRY_WINDOW_SECONDS the message
 * is skipped (and reported). Same counter, same hashing, never the id.
 */
export const MAX_INGEST_RETRIES = 3;
export const RETRY_WINDOW_SECONDS = 3 * 24 * 60 * 60;

/**
 * Counts one failed ingest of a message. True while it may still be
 * retried (stop before it); false once it failed MAX_INGEST_RETRIES times
 * (skip it). Fails towards retrying: a counter error returns true.
 */
export async function allowIngestRetry(connectionId: string, providerMessageId: string): Promise<boolean> {
  const hash = createHash("sha256").update(`${connectionId}:${providerMessageId}`).digest("hex").slice(0, 40);
  try {
    const { data, error } = await getSupabaseAdmin().rpc("rate_limit_hit", {
      p_key: `mailboxRetry:${RETRY_WINDOW_SECONDS}:${hash}`,
      p_window_seconds: RETRY_WINDOW_SECONDS,
      p_limit: MAX_INGEST_RETRIES,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
