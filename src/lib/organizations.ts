// SERVER-ONLY. The client company a user's receipts belong to.
//
// Every user has one default organisation (organizations.default_for_user_id
// = the user), created lazily here the same way the forwarding alias is
// (src/lib/email-alias.ts) and backfilled by the 2026-11-04 migration. The
// firm portal reads receipts by organization_id, so every receipt-creating
// route sets it; a BEFORE INSERT trigger fills it in if a route forgets.
//
// Never import this file from a "use client" component: it uses the
// service-role Supabase client.

import { getSupabaseAdmin } from "./supabase-admin";

const FALLBACK_NAME = "My company";

/** The user's default organisation id, or null when none exists yet. */
export async function getDefaultOrganizationId(
  userId: string
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("id")
    .eq("default_for_user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[organizations] read failed", error);
    return null;
  }
  return typeof data?.id === "string" ? data.id : null;
}

/**
 * The user's default organisation id, creating it (and the owner
 * membership) on first call. Idempotent: two concurrent first calls race on
 * the unique default_for_user_id index and the loser re-reads the winner's
 * row. Returns null only when the database refuses; callers fall back to
 * the insert trigger, which fills organization_id from the same row.
 *
 * The owner membership is upserted on every call, the existing-company path
 * included: if it failed once after the company was created, the next call
 * repairs it instead of leaving a company nobody owns.
 */
export async function getOrCreateDefaultOrganization(
  userId: string
): Promise<string | null> {
  const existing = await getDefaultOrganizationId(userId);
  if (existing) {
    await ensureOwnerMembership(existing, userId);
    return existing;
  }

  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name")
    .eq("user_id", userId)
    .maybeSingle();
  const companyName =
    typeof profile?.company_name === "string" && profile.company_name.trim()
      ? profile.company_name.trim().slice(0, 200)
      : FALLBACK_NAME;

  const { data: created, error: insertError } = await supabase
    .from("organizations")
    .insert({
      name: companyName,
      default_for_user_id: userId,
      created_by: userId,
    })
    .select("id")
    .single();

  let organizationId: string | null =
    typeof created?.id === "string" ? created.id : null;

  if (insertError) {
    // 23505 = unique_violation: another request minted it first.
    if (insertError.code === "23505") {
      organizationId = await getDefaultOrganizationId(userId);
    } else {
      console.error("[organizations] insert failed", insertError);
      return null;
    }
  }
  if (!organizationId) return null;

  await ensureOwnerMembership(organizationId, userId);
  return organizationId;
}

// Idempotent: an existing membership (whatever its role) is left as it is.
async function ensureOwnerMembership(organizationId: string, userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("memberships")
    .upsert(
      { organization_id: organizationId, user_id: userId, role: "owner" },
      { onConflict: "organization_id,user_id", ignoreDuplicates: true }
    );
  if (error) console.error("[organizations] membership upsert failed", error);
}

/** True when the user belongs to at least one organisation (as a customer). */
export async function hasAnyMembership(userId: string): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("organization_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error("[organizations] membership count failed", error);
    // Fail towards "is a customer": the /app page then behaves as today.
    return true;
  }
  return (count ?? 0) > 0;
}
