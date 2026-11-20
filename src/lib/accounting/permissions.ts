// SERVER-ONLY. Who may connect a company's Fortnox and who approves its
// vouchers (founder decision 2026-11-20, default):
//
//   * connect / disconnect / settings: an owner of the company, or staff of
//     the accounting firm actively linked to it;
//   * approve and post: the linked firm when the company has one (it books
//     the company today), otherwise an owner. Owners of a company with a
//     firm see the state, read-only.
//
// Every read uses the session user's own id; the organisation id comes from
// the receipt row or from requireFirmClientAccess(), never the request alone.

import "server-only";

import { getDefaultOrganizationId } from "@/lib/organizations";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export class AccountingAccessError extends Error {
  constructor() {
    super("accounting access lookup failed");
    this.name = "AccountingAccessError";
  }
}

export type OrganizationActor = { kind: "owner" } | { kind: "firm"; firmId: string };

/** The company's linked firm, or null. */
export async function activeFirmOf(organizationId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("firm_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new AccountingAccessError();
  return (data?.firm_id as string | undefined) ?? null;
}

/** How `userId` relates to the company, or null when not at all (as an owner or its firm). */
export async function organizationActor(userId: string, organizationId: string): Promise<OrganizationActor | null> {
  const db = getSupabaseAdmin();
  const { data: owner, error: ownerError } = await db
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerError) throw new AccountingAccessError();
  if (owner) return { kind: "owner" };

  const { data: member, error: memberError } = await db
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw new AccountingAccessError();
  if (!member) return null;
  const firmId = await activeFirmOf(organizationId);
  return firmId && firmId === member.firm_id ? { kind: "firm", firmId } : null;
}

/** May this actor approve and post the company's vouchers? */
export function mayApprove(actor: OrganizationActor | null, companyFirmId: string | null): boolean {
  if (!actor) return false;
  if (actor.kind === "firm") return actor.firmId === companyFirmId;
  return companyFirmId === null;
}

/**
 * The company a connect/settings request is about, and how the user relates
 * to it. `orgParam` (firm staff pass their client's id) is only a key: the
 * user must be an owner of it or staff of its linked firm. Without it, the
 * user's own company. Null when the user has no such right.
 */
export async function resolveOrganization(
  userId: string,
  orgParam: string | null,
): Promise<{ organizationId: string; actor: OrganizationActor } | null> {
  const organizationId = orgParam ?? (await getDefaultOrganizationId(userId));
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  const actor = await organizationActor(userId, organizationId);
  return actor ? { organizationId, actor } : null;
}
