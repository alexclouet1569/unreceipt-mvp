// SERVER-ONLY. Mirrors the editable parts of auth.users.user_metadata
// into public.profiles after a successful signUp / sign-in callback.
//
// Idempotent — `onConflict: "user_id"` upsert keeps the row in sync if
// the user later updates their display name. Failures are logged but
// non-fatal: the auth session is already established, and a missing
// profile only degrades the /admin display ("Anonymous user (email)")
// — it does NOT block the user from reaching /app.

import { getSupabaseAdmin } from "./supabase-admin";

type SignUpMetadata = {
  full_name?: unknown;
  company_name?: unknown;
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
  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        full_name: fullName,
        company_name: companyName,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[profile-sync] upsert failed", error);
  }
}
