// SERVER-ONLY. Deletes a customer's account and everything stored for it.
// Used by the in-app "Delete account" flow (POST /api/account/delete) and by
// the retention job 90 days after cancellation (/api/cron/retention).
// Never import from a "use client" file: it uses the service-role client
// and the Stripe secret key.
//
// Order matters, and each step stops the run on failure so a retry can
// finish the job instead of leaving a half-deleted account:
//   1. Cancel any live Stripe subscription — a deleted customer must never
//      be charged again. Stripe's customer and invoices are kept: they are
//      UnReceipt's own billing records, which the law requires us to keep.
//   2. Remove every stored file under `<user_id>/` in each private bucket.
//   3. Delete the receipts, then the auth user. profiles, subscriptions,
//      receipt_usage (and transactions via profiles) cascade from
//      auth.users ON DELETE CASCADE.
//   4. Best-effort clean-up of data keyed by the user without a foreign
//      key: rate-limit counters and a waitlist entry with the same email.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase-admin";
import { getStripe } from "./stripe";

// Every bucket that stores files under `<user_id>/`.
export const USER_FILE_BUCKETS = ["receipts", "receipt-originals", "exports"] as const;

// Subscription states Stripe can still charge.
const CHARGEABLE_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "incomplete",
  "unpaid",
]);

export class AccountDeletionError extends Error {
  constructor(
    public readonly step: "stripe" | "storage" | "rows" | "auth",
    message: string,
  ) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

const LIST_PAGE = 1000;
const REMOVE_BATCH = 100;

/**
 * Every object path under `prefix` in `bucket`, descending into folders
 * (Supabase lists one level at a time; folders come back with id null).
 */
export async function listAllPaths(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const folders = [prefix];
  while (folders.length > 0) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: LIST_PAGE, offset });
      if (error) {
        // A bucket that doesn't exist yet (its SQL not applied) holds
        // nothing to delete.
        if (/not found/i.test(error.message ?? "")) return paths;
        throw new AccountDeletionError("storage", `list ${bucket} failed`);
      }
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${folder}/${entry.name}`;
        if (entry.id == null) folders.push(path);
        else paths.push(path);
      }
      if (entries.length < LIST_PAGE) break;
    }
  }
  return paths;
}

async function cancelStripeSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId);
  if (error) throw new AccountDeletionError("stripe", "subscription lookup failed");

  const live = (data ?? []).filter(
    (s) => s.stripe_subscription_id && CHARGEABLE_STATUSES.has(s.status),
  );
  if (live.length === 0) return 0;

  const stripe = getStripe();
  for (const sub of live) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      // Already gone on Stripe's side is the outcome we want.
      const code = (err as { code?: string }).code;
      if (code === "resource_missing") continue;
      throw new AccountDeletionError("stripe", "subscription cancel failed");
    }
  }
  return live.length;
}

async function removeUserFiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  let removed = 0;
  for (const bucket of USER_FILE_BUCKETS) {
    const paths = await listAllPaths(supabase, bucket, userId);
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw new AccountDeletionError("storage", `remove from ${bucket} failed`);
      removed += batch.length;
    }
  }
  return removed;
}

// How recently the customer must have signed in to delete their account
// from the app, so a session left open on a shared computer isn't enough.
export const FRESH_SIGN_IN_MS = 30 * 60 * 1000;

export function isFreshSignIn(
  lastSignInAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSignInAt) return false;
  const t = Date.parse(lastSignInAt);
  return Number.isFinite(t) && now - t <= FRESH_SIGN_IN_MS;
}

export type AccountDeletionResult = {
  canceledSubscriptions: number;
  removedFiles: number;
};

export async function deleteAccount(
  userId: string,
  { email }: { email?: string | null } = {},
): Promise<AccountDeletionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new AccountDeletionError("auth", "invalid user id");
  }
  const supabase = getSupabaseAdmin();

  const canceledSubscriptions = await cancelStripeSubscriptions(supabase, userId);
  const removedFiles = await removeUserFiles(supabase, userId);

  const { error: receiptsError } = await supabase
    .from("receipts")
    .delete()
    .eq("user_id", userId);
  if (receiptsError) throw new AccountDeletionError("rows", "receipts delete failed");

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) throw new AccountDeletionError("auth", "auth user delete failed");

  // No foreign key to auth.users, so nothing cascades. Failures here don't
  // undo the deletion; they only leave a counter or a waitlist row behind.
  const { error: rlError } = await supabase
    .from("rate_limits")
    .delete()
    // Keys are `<name>:<window>:<subject>`; a UUID has no `_` or `%`, so
    // the pattern can only match this user's counters.
    .like("key", `%:${userId}`);
  if (rlError) console.error("[account-deletion] rate-limit cleanup failed", rlError.code);
  if (email) {
    const { error: wlError } = await supabase
      .from("waitlist")
      .delete()
      // Stored lowercased by /api/waitlist. eq, not ilike: `_` and `%` in
      // an address would be wildcards and could match someone else's row.
      .eq("email", email.trim().toLowerCase());
    if (wlError) console.error("[account-deletion] waitlist cleanup failed", wlError.code);
  }

  return { canceledSubscriptions, removedFiles };
}
