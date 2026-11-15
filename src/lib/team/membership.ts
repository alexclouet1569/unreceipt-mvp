// SERVER-ONLY. Who belongs to which company, and what follows from it
// (2026-11-15 "Company team" block; rules in ./rules.ts).
//
// - An employee (role approver/member) works for one company: their receipts
//   go there (receiptOrganizationFor), and their access and plan usage are
//   the company's (billingUserFor: the company's first owner).
// - Everyone else works in their own default company, as its owner.
//
// Never import this file from a "use client" component: it uses the
// service-role Supabase client.

import { getSupabaseAdmin } from "../supabase-admin";
import { getOrCreateDefaultOrganization } from "../organizations";
import type { MembershipRole } from "../types";
import type { TeamMember } from "./rules";

export class TeamReadError extends Error {
  constructor(message = "team read failed") {
    super(message);
    this.name = "TeamReadError";
  }
}

export type Employment = { organizationId: string; role: "approver" | "member"; approverId: string | null };

/** The company `userId` is an employee of, or null. Throws TeamReadError on a database failure. */
export async function getEmployment(userId: string): Promise<Employment | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("organization_id, role, approver_id")
    .eq("user_id", userId)
    .in("role", ["approver", "member"])
    .maybeSingle();
  if (error) throw new TeamReadError(`employment read failed (${error.code})`);
  if (!data) return null;
  return {
    organizationId: data.organization_id as string,
    role: data.role as "approver" | "member",
    approverId: (data.approver_id as string | null) ?? null,
  };
}

/**
 * The company a new receipt of `userId` belongs to: the employer for an
 * employee, else the user's own (minted on first use). On a failed read it
 * returns null and the insert trigger decides, which applies the same rule.
 */
export async function receiptOrganizationFor(userId: string): Promise<string | null> {
  try {
    const employment = await getEmployment(userId);
    if (employment) return employment.organizationId;
  } catch (err) {
    console.error("[team] employment read failed", err instanceof Error ? err.message : "unknown");
    return null;
  }
  return getOrCreateDefaultOrganization(userId);
}

/** The company's owners, oldest first. */
async function ownersOf(organizationId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("user_id, created_at")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .order("created_at", { ascending: true });
  if (error) throw new TeamReadError(`owners read failed (${error.code})`);
  return (data ?? []).map((r) => r.user_id as string);
}

/**
 * Whose subscription and plan usage count for `userId`: for an employee the
 * company's first owner, else the user. On a database failure the user
 * themself (the subscription gate fails open on its own errors anyway).
 */
export async function billingUserFor(userId: string): Promise<string> {
  try {
    const employment = await getEmployment(userId);
    if (!employment) return userId;
    const [first] = await ownersOf(employment.organizationId);
    return first ?? userId;
  } catch (err) {
    console.error("[team] billing user read failed", err instanceof Error ? err.message : "unknown");
    return userId;
  }
}

/** Everyone in the company with their role and approver. Throws TeamReadError. */
export async function loadTeam(organizationId: string): Promise<TeamMember[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("user_id, role, approver_id, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new TeamReadError(`team read failed (${error.code})`);
  return (data ?? []).map((r) => ({
    userId: r.user_id as string,
    role: r.role as MembershipRole,
    approverId: (r.approver_id as string | null) ?? null,
  }));
}

/**
 * The company `userId` works in and their role there: the employer for an
 * employee, else their own default company as owner (minted on first use).
 * null only when the company can't be created.
 */
export async function teamContextFor(
  userId: string
): Promise<{ organizationId: string; role: MembershipRole } | null> {
  const employment = await getEmployment(userId);
  if (employment) return { organizationId: employment.organizationId, role: employment.role };
  const organizationId = await getOrCreateDefaultOrganization(userId);
  return organizationId ? { organizationId, role: "owner" } : null;
}

export type PersonLabel = { userId: string; email: string | null; name: string | null };

/** Email and name of each user, for the team screens and emails. Missing users get nulls. */
export async function peopleById(userIds: string[]): Promise<Map<string, PersonLabel>> {
  const db = getSupabaseAdmin();
  const unique = [...new Set(userIds)];
  const people = await Promise.all(
    unique.map(async (userId): Promise<PersonLabel> => {
      try {
        const { data } = await db.auth.admin.getUserById(userId);
        const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const full = typeof meta.full_name === "string" ? meta.full_name.trim().slice(0, 120) : "";
        return { userId, email: data?.user?.email ?? null, name: full || null };
      } catch {
        return { userId, email: null, name: null };
      }
    })
  );
  return new Map(people.map((p) => [p.userId, p]));
}

/** How a person is shown: their name, else their address, else "A colleague". */
export function labelOf(p: PersonLabel | undefined): string {
  return p?.name || p?.email || "A colleague";
}
