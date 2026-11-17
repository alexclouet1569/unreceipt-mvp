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

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function syncProfile(
  userId: string,
  metadata: SignUpMetadata | null | undefined
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
  if (!source) return;
  const { error: sourceError } = await getSupabaseAdmin()
    .from("profiles")
    .update({ signup_source: source })
    .eq("user_id", userId)
    .is("signup_source", null);
  if (sourceError) {
    console.error("[profile-sync] signup_source update failed", sourceError.code);
  }
}
