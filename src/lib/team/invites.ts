// SERVER-ONLY. Building the team (2026-11-15): an owner invites by email,
// sets each person's role and approver, and removes people. Someone joins
// only by pressing Join on /app/team-join, signed in with the invited,
// confirmed address (normalizedSessionEmail): any owner can type any
// address, so being invited never makes anyone a member by itself (the same
// rule as a firm seat, AGENTS.md firm portal rule 4).
//
// Never import this file from a "use client" component: it uses the
// service-role Supabase client.

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeAddress, normalizedSessionEmail } from "../email-address";
import type { MembershipRole } from "../types";
import { getEmployment, labelOf, loadTeam, peopleById, teamContextFor } from "./membership";
import { sendTeamInvite } from "./emails";
import { isAcceptableDisplayName } from "../firm/names";

type Fail = { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };
const fail = (status: Fail["status"], error: string): Fail => ({ ok: false, status, error });

export const TEAM_LIMIT = 50;

/** The owner's company, or a refusal for anyone else. */
async function ownerCompany(userId: string): Promise<{ ok: true; organizationId: string } | Fail> {
  let context;
  try {
    context = await teamContextFor(userId);
  } catch {
    return fail(500, "lookup_failed");
  }
  if (!context) return fail(500, "lookup_failed");
  if (context.role !== "owner") return fail(403, "owners_only");
  return { ok: true, organizationId: context.organizationId };
}

export type TeamView = {
  companyName: string;
  members: Array<{ userId: string; label: string; email: string | null; role: MembershipRole; approverId: string | null; you: boolean }>;
  invites: Array<{ id: string; email: string; role: "approver" | "member"; createdAt: string }>;
};

/** The team page for an owner. */
export async function loadTeamView(userId: string): Promise<{ ok: true; value: TeamView } | Fail> {
  const company = await ownerCompany(userId);
  if (!company.ok) return company;
  const db = getSupabaseAdmin();
  try {
    const [team, org, invites] = await Promise.all([
      loadTeam(company.organizationId),
      db.from("organizations").select("name").eq("id", company.organizationId).maybeSingle(),
      db
        .from("team_invites")
        .select("id, email, role, created_at")
        .eq("organization_id", company.organizationId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (org.error || invites.error) return fail(500, "lookup_failed");
    const people = await peopleById(team.map((m) => m.userId));
    return {
      ok: true,
      value: {
        companyName: typeof org.data?.name === "string" ? org.data.name : "Your company",
        members: team.map((m) => ({
          userId: m.userId,
          label: labelOf(people.get(m.userId)),
          email: people.get(m.userId)?.email ?? null,
          role: m.role,
          approverId: m.approverId,
          you: m.userId === userId,
        })),
        invites: (invites.data ?? []).map((i) => ({
          id: i.id as string,
          email: i.email as string,
          role: i.role as "approver" | "member",
          createdAt: i.created_at as string,
        })),
      },
    };
  } catch {
    return fail(500, "lookup_failed");
  }
}

/** An owner invites an address. Emails it; an address already waiting is invited again. */
export async function createTeamInvite(
  owner: User,
  input: { email: string; role: "approver" | "member"; approverId: string | null }
): Promise<{ ok: true; emailed: boolean } | Fail> {
  const company = await ownerCompany(owner.id);
  if (!company.ok) return company;
  const email = normalizeAddress(input.email);
  if (!email) return fail(400, "invalid_email");
  if (email === normalizedSessionEmail(owner)) return fail(400, "own_address");

  const db = getSupabaseAdmin();
  let team;
  try {
    team = await loadTeam(company.organizationId);
  } catch {
    return fail(500, "lookup_failed");
  }
  if (team.length >= TEAM_LIMIT) return fail(409, "team_full");
  if (input.approverId && !team.some((m) => m.userId === input.approverId && (m.role === "owner" || m.role === "approver"))) {
    return fail(400, "invalid_approver");
  }
  // Already in the team: nothing to invite.
  const people = await peopleById(team.map((m) => m.userId));
  if ([...people.values()].some((p) => p.email && normalizeAddress(p.email) === email)) return fail(409, "already_member");

  // Invited again: the waiting row takes the new role and approver. The
  // unique index is partial (waiting rows only), so it can't be an upsert
  // target: update first, insert when there was nothing to update.
  const fields = { role: input.role, approver_id: input.approverId, invited_by: owner.id };
  const { data: updated, error: updateError } = await db
    .from("team_invites")
    .update(fields)
    .eq("organization_id", company.organizationId)
    .eq("email", email)
    .is("accepted_at", null)
    .select("id");
  if (updateError) return fail(500, "save_failed");
  if (!updated || updated.length === 0) {
    const { error: insertError } = await db
      .from("team_invites")
      .insert({ organization_id: company.organizationId, email, ...fields });
    // 23505: the same invite made in another tab a moment ago.
    if (insertError && insertError.code !== "23505") return fail(500, "save_failed");
  }

  const { data: org } = await db.from("organizations").select("name").eq("id", company.organizationId).maybeSingle();
  const me = people.get(owner.id);
  // Both names go into an email from our domain to an address anyone can
  // type: only names that pass the same check as a firm's (firm rule 5).
  const companyName = typeof org?.name === "string" && isAcceptableDisplayName(org.name) ? org.name : "A company";
  const inviter = me?.name && isAcceptableDisplayName(me.name) ? me.name : me?.email ?? "A colleague";
  const emailed = await sendTeamInvite({ to: input.email.trim(), companyName, inviterName: inviter });
  return { ok: true, emailed };
}

export async function revokeTeamInvite(ownerId: string, inviteId: string): Promise<{ ok: true } | Fail> {
  const company = await ownerCompany(ownerId);
  if (!company.ok) return company;
  const { data, error } = await getSupabaseAdmin()
    .from("team_invites")
    .delete()
    .eq("id", inviteId)
    .eq("organization_id", company.organizationId)
    .is("accepted_at", null)
    .select("id");
  if (error) return fail(500, "save_failed");
  if (!data || data.length === 0) return fail(404, "not_found");
  return { ok: true };
}

/** Changes a colleague's role or approver. Owners can't be changed here. */
export async function updateTeamMember(
  ownerId: string,
  memberId: string,
  input: { role?: "approver" | "member"; approverId?: string | null }
): Promise<{ ok: true } | Fail> {
  const company = await ownerCompany(ownerId);
  if (!company.ok) return company;
  let team;
  try {
    team = await loadTeam(company.organizationId);
  } catch {
    return fail(500, "lookup_failed");
  }
  const member = team.find((m) => m.userId === memberId);
  if (!member || member.role === "owner") return fail(404, "not_found");
  if (input.approverId) {
    if (input.approverId === memberId) return fail(400, "invalid_approver");
    const approver = team.find((m) => m.userId === input.approverId);
    if (!approver || (approver.role !== "owner" && approver.role !== "approver")) return fail(400, "invalid_approver");
  }
  const update: Record<string, unknown> = {};
  if (input.role) update.role = input.role;
  if (input.approverId !== undefined) update.approver_id = input.approverId;
  if (Object.keys(update).length === 0) return fail(400, "nothing_to_change");

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("memberships")
    .update(update)
    .eq("organization_id", company.organizationId)
    .eq("user_id", memberId)
    .neq("role", "owner");
  if (error) return fail(500, "save_failed");
  // No longer an approver: the people they approved go to the owners.
  if (input.role === "member") {
    await db
      .from("memberships")
      .update({ approver_id: null })
      .eq("organization_id", company.organizationId)
      .eq("approver_id", memberId);
  }
  return { ok: true };
}

/**
 * Removes a colleague. Their receipts stay with the company (they are the
 * company's records); new ones go to their own account from now on.
 */
export async function removeTeamMember(ownerId: string, memberId: string): Promise<{ ok: true } | Fail> {
  const company = await ownerCompany(ownerId);
  if (!company.ok) return company;
  if (memberId === ownerId) return fail(400, "cannot_remove_self");
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("memberships")
    .delete()
    .eq("organization_id", company.organizationId)
    .eq("user_id", memberId)
    .in("role", ["approver", "member"])
    .select("user_id");
  if (error) return fail(500, "save_failed");
  if (!data || data.length === 0) return fail(404, "not_found");
  await db
    .from("memberships")
    .update({ approver_id: null })
    .eq("organization_id", company.organizationId)
    .eq("approver_id", memberId);
  return { ok: true };
}

export type WaitingTeamInvite = { id: string; companyName: string; role: "approver" | "member" };

/** The invites waiting for the signed-in, confirmed address. */
export async function findWaitingTeamInvites(user: User): Promise<WaitingTeamInvite[]> {
  const email = normalizedSessionEmail(user);
  if (!email) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("team_invites")
    .select("id, role, organization_id, organizations(name)")
    .eq("email", email)
    .is("accepted_at", null)
    .limit(20);
  if (error) {
    console.error("[team] invite lookup failed", error.code);
    return [];
  }
  return (data ?? []).map((r) => {
    const org = (Array.isArray(r.organizations) ? r.organizations[0] : r.organizations) as { name?: string } | null;
    // Shown on /app and /app/team-join: any owner chooses it, so the same check as the email's.
    const name = org?.name && isAcceptableDisplayName(org.name) ? org.name : "A company";
    return { id: r.id as string, companyName: name, role: r.role as "approver" | "member" };
  });
}

/** Join pressed: becomes an employee of the invite's company. */
export async function acceptTeamInvite(user: User, inviteId: string): Promise<{ ok: true; companyName: string } | Fail> {
  const email = normalizedSessionEmail(user);
  if (!email) return fail(403, "email_not_confirmed");
  const db = getSupabaseAdmin();
  const { data: invite, error } = await db
    .from("team_invites")
    .select("id, organization_id, role, approver_id, email, organizations(name, default_for_user_id)")
    .eq("id", inviteId)
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();
  if (error) return fail(500, "lookup_failed");
  // Not this address's invite: a miss, like one that doesn't exist.
  if (!invite) return fail(404, "not_found");
  const org = (Array.isArray(invite.organizations) ? invite.organizations[0] : invite.organizations) as {
    name?: string;
    default_for_user_id?: string | null;
  } | null;
  // Your own company can't employ you.
  if (org?.default_for_user_id === user.id) return fail(409, "own_company");

  let employment;
  try {
    employment = await getEmployment(user.id);
  } catch {
    return fail(500, "lookup_failed");
  }
  if (employment && employment.organizationId !== invite.organization_id) return fail(409, "already_in_a_team");

  if (!employment) {
    const { error: insertError } = await db.from("memberships").insert({
      organization_id: invite.organization_id,
      user_id: user.id,
      role: invite.role,
      approver_id: invite.approver_id,
    });
    // 23505: already a member here (another tab), or employed elsewhere meanwhile.
    if (insertError && insertError.code !== "23505") return fail(500, "save_failed");
    if (insertError) {
      const again = await getEmployment(user.id).catch(() => null);
      if (again?.organizationId !== invite.organization_id) return fail(409, "already_in_a_team");
    }
  }
  await db
    .from("team_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id)
    .is("accepted_at", null);
  return { ok: true, companyName: org?.name ?? "your company" };
}

/** "Not me": the waiting invites to this address go away. */
export async function declineTeamInvite(user: User, inviteId: string): Promise<{ ok: true } | Fail> {
  const email = normalizedSessionEmail(user);
  if (!email) return fail(403, "email_not_confirmed");
  const { error } = await getSupabaseAdmin()
    .from("team_invites")
    .delete()
    .eq("id", inviteId)
    .eq("email", email)
    .is("accepted_at", null);
  if (error) return fail(500, "save_failed");
  return { ok: true };
}
