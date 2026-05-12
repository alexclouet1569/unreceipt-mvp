// SERVER-ONLY. Per-user forwarding alias plumbing for the email-intake path
// at /api/intake/email. Surface area:
//
//   * generateAliasHash()        — 10-char Crockford base32 from CSPRNG.
//   * buildForwardingAddress(h)  — formats `receipts+<hash>@<INBOUND_DOMAIN>`.
//   * parseAliasFromTo(to)       — extracts the <hash> portion from a To:
//                                  header value (RFC 5322, single addr).
//   * getOrCreateAliasForUser(u) — fetches the hash from public.profiles,
//                                  minting + persisting one if absent.
//   * findUserByAliasHash(h)     — reverse lookup used by the webhook.
//
// Why a stored random alias instead of FNV(user_id) like getConciergeEmail:
//   * The webhook routes real email — a collision silently mis-routes
//     someone's receipt. The schema column has a unique partial index so
//     a duplicate write fails loudly; a deterministic hash gives us no
//     such safety net.
//   * Allows alias rotation later without recomputing from user_id.
//   * 50 bits of entropy is overkill for our scale but free.
//
// Never import this file from a "use client" component — the lookup
// uses the service-role Supabase client.

import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin";

// Crockford base32 — no I, L, O, U. Lowercased so it's friendlier in a
// type-able email address. We accept both cases on the way in.
const CROCKFORD_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const ALIAS_LENGTH = 10;

export const INBOUND_DOMAIN_DEFAULT = "in.unreceipt.com";

function getInboundDomain(): string {
  const fromEnv = process.env.INBOUND_DOMAIN;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return INBOUND_DOMAIN_DEFAULT;
}

export function generateAliasHash(): string {
  // 10 chars × 5 bits/char = 50 bits — read 8 bytes (64 bits) for headroom
  // against modulo bias on partial bytes, then map to the alphabet.
  const bytes = randomBytes(8);
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < ALIAS_LENGTH) {
      bits -= 5;
      const idx = (acc >> bits) & 0b11111;
      out += CROCKFORD_ALPHABET[idx];
    }
    if (out.length >= ALIAS_LENGTH) break;
  }
  return out;
}

export function buildForwardingAddress(hash: string): string {
  return `receipts+${hash}@${getInboundDomain()}`;
}

// Pulls the +tag from a To: header value. Accepts:
//   * "receipts+abc123@in.unreceipt.com"
//   * "UnReceipt <receipts+abc123@in.unreceipt.com>"
//   * `"Alex" <receipts+ABC123@in.unreceipt.com>` (case-insensitive)
// Returns null if the address doesn't match the receipts+<tag>@... shape.
// The local part is intentionally locked to literal "receipts" — Resend
// Inbound routes everything for the domain to the webhook so an arbitrary
// `support+xxx@in.unreceipt.com` would otherwise also resolve, masking
// typos and spam in users' real inboxes.
export function parseAliasFromTo(to: string | null | undefined): string | null {
  if (typeof to !== "string" || to.length === 0) return null;
  // Strip optional display name + angle brackets.
  const m = to.match(/<([^>]+)>/);
  const addr = (m ? m[1] : to).trim().toLowerCase();
  const at = addr.indexOf("@");
  if (at <= 0) return null;
  const local = addr.slice(0, at);
  if (!local.startsWith("receipts+")) return null;
  const tag = local.slice("receipts+".length);
  // The hash uses Crockford base32 lowercase. Accept the canonical alphabet
  // only — reject anything else so malformed tags fail at parse time, not
  // database time.
  if (!/^[0-9a-hjkmnp-tv-z]{6,20}$/.test(tag)) return null;
  return tag;
}

// Fetches a user's alias hash, minting and persisting one if none exists.
// Idempotent — concurrent first-reads race on the unique index; the loser
// re-reads the row and uses the winner's value. Returns null only if the
// profile row itself is missing (the caller should syncProfile() first).
export async function getOrCreateAliasForUser(
  userId: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("email_alias_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("[email-alias] read failed", readError);
    return null;
  }
  if (!existing) return null;
  if (typeof existing.email_alias_hash === "string" && existing.email_alias_hash.length > 0) {
    return existing.email_alias_hash;
  }

  // Mint + write. On the rare 23505 unique-violation (two processes
  // minting at once for the same user, or a hash collision across users),
  // re-read once. We don't retry on collision because the lookup-then-read
  // would return whichever row is actually persisted.
  const hash = generateAliasHash();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ email_alias_hash: hash })
    .eq("user_id", userId)
    .is("email_alias_hash", null);

  if (updateError) {
    // 23505 = unique_violation. Re-read; whichever value won is the truth.
    if (typeof updateError.code === "string" && updateError.code === "23505") {
      const { data: reread } = await supabase
        .from("profiles")
        .select("email_alias_hash")
        .eq("user_id", userId)
        .maybeSingle();
      return reread?.email_alias_hash ?? null;
    }
    console.error("[email-alias] write failed", updateError);
    return null;
  }

  // The .is("email_alias_hash", null) guard means the UPDATE is a no-op if
  // another process won the race for this user_id. Re-read to get whichever
  // value is now persisted.
  const { data: confirmed } = await supabase
    .from("profiles")
    .select("email_alias_hash")
    .eq("user_id", userId)
    .maybeSingle();

  return confirmed?.email_alias_hash ?? null;
}

export async function findUserByAliasHash(
  hash: string
): Promise<{ user_id: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email_alias_hash", hash)
    .maybeSingle();
  if (error) {
    console.error("[email-alias] reverse lookup failed", error);
    return null;
  }
  return data ?? null;
}
