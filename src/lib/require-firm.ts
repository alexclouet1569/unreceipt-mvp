// SERVER-ONLY. Authorization for the accounting-firm portal (/firm and
// /api/firm). Same shape as require-admin.ts: re-read the session cookie,
// then check the database. Receipts stay owner-only at the database; every
// firm read happens here, server-side, with the service role and scoped by
// the organisation the firm is linked to.
//
// Rules (also enforced by .claude/agents/security-reviewer.md):
//   * Every /firm page and every /api/firm handler calls requireFirmMember()
//     before any read or write. Layouts alone are not enough.
//   * Every service-role query on client data is scoped with
//     .eq("organization_id", id) where id came from requireFirmClientAccess().
//   * The firm id always comes from the session-bound membership row, never
//     from the request.
//
// Staff rows are created by email (firm_members.user_id IS NULL). On the
// first sign-in with that confirmed address the row is claimed here; the
// magic-link / email-code flow is what confirms the address.

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getServerUser } from "./supabase-server";
import { getSupabaseAdmin } from "./supabase-admin";
import type { FirmMemberRole } from "./types";

export type FirmAuthReason = "no_user" | "not_member" | "no_access";

export class FirmAuthError extends Error {
  reason: FirmAuthReason;
  constructor(reason: FirmAuthReason) {
    super(
      reason === "no_user"
        ? "Not authenticated"
        : reason === "not_member"
          ? "Not a firm member"
          : "No access to this client"
    );
    this.name = "FirmAuthError";
    this.reason = reason;
  }
}

export interface FirmContext {
  user: User;
  memberId: string;
  firmId: string;
  firmName: string;
  role: FirmMemberRole;
}

type MemberRow = {
  id: string;
  firm_id: string;
  role: FirmMemberRole;
  firms: { name: string } | { name: string }[] | null;
};

function firmName(row: MemberRow): string {
  const f = Array.isArray(row.firms) ? row.firms[0] : row.firms;
  return f?.name ?? "Your firm";
}

const MEMBER_SELECT = "id, firm_id, role, firms(name)";

/**
 * The signed-in user's firm membership, or null. Cheap: one indexed read.
 * Does not claim pending rows; use requireFirmMember() for that.
 */
export async function getFirmMembership(
  userId: string
): Promise<Omit<FirmContext, "user"> | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("firm_members")
    .select(MEMBER_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[require-firm] membership read failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as MemberRow;
  return {
    memberId: row.id,
    firmId: row.firm_id,
    firmName: firmName(row),
    role: row.role,
  };
}

// A pending row for this confirmed email gets this user. The partial unique
// index on user_id means two firms can't both claim the same person.
async function claimPendingMembership(
  user: User
): Promise<Omit<FirmContext, "user"> | null> {
  if (!user.email || !user.email_confirmed_at) return null;
  const email = user.email.trim().toLowerCase();
  const db = getSupabaseAdmin();
  // Exactly one row: the same address invited by two firms must not fail
  // the whole update on the one-firm-per-person index.
  const { data: pending, error: pendingError } = await db
    .from("firm_members")
    .select("id")
    .eq("email", email)
    .is("user_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pendingError) {
    console.error("[require-firm] pending lookup failed", pendingError);
    return null;
  }
  if (!pending) return null;
  const { data, error } = await db
    .from("firm_members")
    .update({ user_id: user.id, claimed_at: new Date().toISOString() })
    .eq("id", pending.id as string)
    .is("user_id", null)
    .select(MEMBER_SELECT)
    .maybeSingle();
  if (error) {
    console.error("[require-firm] claim failed", error.code);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as MemberRow;
  return {
    memberId: row.id,
    firmId: row.firm_id,
    firmName: firmName(row),
    role: row.role,
  };
}

/** The user's firm membership, claiming a pending invite row if there is one. */
export async function resolveFirmMembership(
  user: User
): Promise<Omit<FirmContext, "user"> | null> {
  return (await getFirmMembership(user.id)) ?? (await claimPendingMembership(user));
}

/** Throws FirmAuthError unless the session user is a firm member. */
export async function requireFirmMember(): Promise<FirmContext> {
  const user = await getServerUser();
  if (!user) throw new FirmAuthError("no_user");

  const membership =
    (await getFirmMembership(user.id)) ?? (await claimPendingMembership(user));
  if (!membership) throw new FirmAuthError("not_member");

  return { user, ...membership };
}

/**
 * For /firm pages and layouts: signed-out users go to the login page and
 * come back; signed-in non-members go to their own receipts. Call it in
 * every page, not only the layout — layouts don't re-run on client
 * navigations.
 */
export async function requireFirmMemberPage(): Promise<FirmContext> {
  try {
    return await requireFirmMember();
  } catch (err) {
    if (err instanceof FirmAuthError) {
      redirect(err.reason === "no_user" ? "/app/login?next=/firm" : "/app");
    }
    throw err;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export interface FirmClientAccess {
  firmClientId: string;
  organizationId: string;
  clientName: string;
}

/**
 * Throws FirmAuthError("no_access") unless `organizationId` is an active
 * client of `firmId`. The returned organisation id is the ONLY value that
 * may scope a service-role query on client data.
 */
export async function requireFirmClientAccess(
  firmId: string,
  organizationId: string
): Promise<FirmClientAccess> {
  if (!isUuid(organizationId)) throw new FirmAuthError("no_access");
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("id, organization_id, client_name")
    .eq("firm_id", firmId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.error("[require-firm] client access read failed", error);
    throw new FirmAuthError("no_access");
  }
  if (!data) throw new FirmAuthError("no_access");
  return {
    firmClientId: data.id as string,
    organizationId: data.organization_id as string,
    clientName: data.client_name as string,
  };
}

/** Standard JSON responses for /api/firm handlers. */
export function firmAuthResponse(err: FirmAuthError): Response {
  if (err.reason === "no_user") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (err.reason === "not_member") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  // A client the firm isn't linked to looks exactly like one that doesn't
  // exist, so ids can't be probed.
  return Response.json({ error: "not_found" }, { status: 404 });
}
