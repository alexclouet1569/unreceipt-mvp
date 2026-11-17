// SERVER-ONLY. Mirrors the editable parts of auth.users.user_metadata
// into public.profiles after a successful signUp / sign-in callback.
//
// Idempotent — `onConflict: "user_id"` upsert keeps the row in sync if
// the user later updates their display name. Failures are logged but
// non-fatal: the auth session is already established, and a missing
// profile only degrades the /admin display ("Anonymous user (email)")
// — it does NOT block the user from reaching /app.

import { getSupabaseAdmin } from "./supabase-admin";
import { sanitizeSignupSource } from "./attribution";

type SignUpMetadata = {
  full_name?: unknown;
  company_name?: unknown;
  signup_source?: unknown;
};

// The source is copied only onto a new account: an older one (from before
// 2026-11-17, the iPhone app or an invite) has none, and its owner could
// otherwise add one to their own metadata and have it copied on the next
// sign-in. A week covers a confirmation link asked for again days later.
const SOURCE_COPY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isNewAccount(createdAt: string | null | undefined, now: number): boolean {
  const t = Date.parse(createdAt ?? "");
  return Number.isFinite(t) && now - t >= 0 && now - t <= SOURCE_COPY_WINDOW_MS;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * `createdAt` is the account's creation time from the server's own read of
 * the user (auth.users.created_at); without it no signup source is copied.
 */
export async function syncProfile(
  userId: string,
  metadata: SignUpMetadata | null | undefined,
  createdAt?: string | null,
  now: number = Date.now()
): Promise<void> {
  const fullName = asTrimmedString(metadata?.full_name);
  const companyName = asTrimmedString(metadata?.company_name);

  // Service role bypasses RLS — we trust this is a fresh post-callback
  // session for the user we're writing on behalf of.
  //
  // `id` is the table's original primary key and references auth.users,
  // so it has to be the user's id too — otherwise a fresh insert gets a
  // random id and fails the foreign key.
  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .upsert(
      {
        id: userId,
        user_id: userId,
        full_name: fullName,
        company_name: companyName,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[profile-sync] upsert failed", error);
    return;
  }

  // Where the sign-up came from (src/lib/attribution.ts): checked again here
  // because user_metadata is writable by the user, and written only while
  // the column is empty, so the first source stays and a re-run is a no-op.
  const rawSource = metadata?.signup_source;
  const source =
    rawSource && typeof rawSource === "object" && !Array.isArray(rawSource)
      ? sanitizeSignupSource(rawSource as Record<string, unknown>)
      : null;
  if (!source || !isNewAccount(createdAt, now)) return;
  const { error: sourceError } = await getSupabaseAdmin()
    .from("profiles")
    .update({ signup_source: source })
    .eq("user_id", userId)
    .is("signup_source", null);
  if (sourceError) {
    console.error("[profile-sync] signup_source update failed", sourceError.code);
  }
}
