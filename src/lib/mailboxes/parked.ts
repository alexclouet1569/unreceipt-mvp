// SERVER-ONLY. The iPhone app's claim step (mailbox_oauth_parked).
//
// The app's OAuth flow runs in the system sign-in sheet, which has no
// UnReceipt session, so the callback can't tell who is at the keyboard: the
// pending row only says who minted the connect link. Saving the mailbox
// there would let anyone mint a link for their own account, send it to a
// victim, and get the victim's mailbox once the victim approves.
//
// So the app's callback never saves. It parks the grant here (the refresh
// token encrypted, bound to the pending row's user) under the sha256 of a
// random one-time code, and sends the browser to
// unreceipt://mailboxes?status=claim&code=<code>&provider=<id>. That redirect
// happens on the device that approved, so only its app sees the code. The
// app then calls POST /api/mailboxes/claim with its own bearer token, and the
// claim succeeds only when that signed-in user is the parked row's user; a
// victim's app (signed in as the victim) is refused and the grant revoked.
//
// A row is taken out of the table before it is used (delete … returning,
// single use), lives 10 minutes, and the daily cleanup revokes and deletes
// expired ones. The code itself is never stored. A grant we won't keep is
// revoked only when no active connection (anyone's) uses the same address:
// at Google every connection of one mailbox shares the grant
// (./shared-grant.ts).

import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailboxOAuthParked } from "@/lib/types";
import { decryptToken, encryptToken } from "./crypto";
import { sha256Hex } from "./oauth";
import { getProvider } from "./providers";
import { revokeUnusedGrant } from "./shared-grant";
import { normalizeMailboxEmail } from "./store";
import { isMailboxProviderId, type MailboxProviderId } from "./types";

export const PARKED_TTL_MS = 10 * 60 * 1000;
/**
 * At most this many expired grants revoked (and deleted) per daily cleanup;
 * any beyond wait for the next run (a claim refuses them meanwhile).
 */
export const CLEANUP_BATCH = 200;
// Revokes in flight at once during the cleanup.
const CLEANUP_CONCURRENCY = 10;

// 32 random bytes, base64url: 43 characters.
const CODE = /^[A-Za-z0-9_-]{43}$/;
const PARKED_COLUMNS = "code_hash, user_id, provider, email, refresh_token_enc, created_at, expires_at";

// Its own AAD context: a parked token decrypts only as its owner's parked
// grant, never as (or on) a connection row.
const parkedContext = (userId: string) => `parked:${userId}`;

export function isClaimCode(value: unknown): value is string {
  return typeof value === "string" && CODE.test(value);
}

/**
 * Parks an exchanged grant for `userId` and returns the one-time code.
 * Null when the address isn't usable; throws on a database error.
 */
export async function parkGrant(
  supabase: SupabaseClient,
  input: { userId: string; provider: MailboxProviderId; email: string; refreshToken: string },
  now: number = Date.now(),
): Promise<{ ok: true; code: string } | { ok: false; error: "invalid_email" }> {
  const email = normalizeMailboxEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };
  const code = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("mailbox_oauth_parked").insert({
    code_hash: sha256Hex(code),
    user_id: input.userId,
    provider: input.provider,
    email,
    refresh_token_enc: encryptToken(input.refreshToken, parkedContext(input.userId)),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + PARKED_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`park failed (${error.code ?? "unknown"})`);
  return { ok: true, code };
}

/**
 * Takes the parked grant for `code` out of the table (single use, even when
 * two claims race). Null for a malformed, unknown or already used code.
 */
export async function takeParked(
  supabase: SupabaseClient,
  code: string,
): Promise<{ ok: true; row: MailboxOAuthParked | null } | { ok: false }> {
  if (!isClaimCode(code)) return { ok: true, row: null };
  const { data, error } = await supabase
    .from("mailbox_oauth_parked")
    .delete()
    .eq("code_hash", sha256Hex(code))
    .select(PARKED_COLUMNS);
  if (error) return { ok: false };
  const row = ((data ?? []) as MailboxOAuthParked[])[0] ?? null;
  return { ok: true, row };
}

/** The parked refresh token in plaintext. Throws when unreadable. */
export function parkedRefreshToken(row: Pick<MailboxOAuthParked, "user_id" | "refresh_token_enc">): string {
  return decryptToken(row.refresh_token_enc, parkedContext(row.user_id));
}

type RevocableParked = Pick<MailboxOAuthParked, "user_id" | "provider" | "email" | "refresh_token_enc">;

/**
 * Revokes a parked grant at the provider that will never be saved (claimed
 * by someone else, expired, refused), unless an active connection uses the
 * same address (revokeUnusedGrant). Best effort and time-boxed; never
 * throws. True only when it was revoked.
 */
export async function revokeParked(row: RevocableParked, supabase?: SupabaseClient): Promise<boolean> {
  if (!isMailboxProviderId(row.provider)) return false;
  let token: string;
  try {
    token = parkedRefreshToken(row);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "parked_revoke", provider: row.provider } });
    return false;
  }
  return (await revokeUnusedGrant(getProvider(row.provider), row.email, token, supabase)) === "revoked";
}

/**
 * Daily cleanup: parked grants past their expiry are revoked at the
 * provider (nobody claimed them, so nothing should keep them) and deleted.
 * Up to CLEANUP_BATCH a run, and only the rows it tried to revoke are
 * deleted, so no grant is ever dropped without a revoke attempt. A failed
 * revoke (Sentry) still deletes the row: retrying daily would not help a
 * token that can't be read, and the grant is useless without our copy.
 * Returns how many rows were deleted.
 */
export async function deleteExpiredParked(
  supabase: SupabaseClient,
  now: number = Date.now(),
): Promise<number> {
  const { data, error } = await supabase
    .from("mailbox_oauth_parked")
    .select("code_hash, user_id, provider, email, refresh_token_enc")
    .lt("expires_at", new Date(now).toISOString())
    .order("expires_at", { ascending: true })
    .limit(CLEANUP_BATCH);
  if (error) throw new Error(`parked cleanup failed (${error.code ?? "unknown"})`);
  const rows = (data ?? []) as Array<RevocableParked & { code_hash: string }>;
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += CLEANUP_CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CLEANUP_CONCURRENCY).map((row) => revokeParked(row, supabase)));
  }
  // A claim may have taken a row meanwhile (it refuses and revokes an
  // expired one itself); deleting by hash just finds fewer.
  const { data: deleted, error: deleteError } = await supabase
    .from("mailbox_oauth_parked")
    .delete()
    .in(
      "code_hash",
      rows.map((r) => r.code_hash),
    )
    .select("code_hash");
  if (deleteError) throw new Error(`parked cleanup failed (${deleteError.code ?? "unknown"})`);
  return (deleted ?? []).length;
}
