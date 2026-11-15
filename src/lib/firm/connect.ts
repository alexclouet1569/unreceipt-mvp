// SERVER-ONLY. A client company connects to an accounting firm from the
// firm's join link (src/lib/firm/join-link.ts): what /app/connect/<code>
// shows (connectState) and what "Yes, share" does (connectToFirm, POST
// /api/firm-connect). The same rules as accepting a firm's invite
// (/api/accountant/respond): the caller's own default company, one active
// firm per company (firm_clients_active_org_unique), a confirmation email to
// the client, and any request the company sent to another accountant
// withdrawn. Also: the firm's own staff can't connect to their own firm,
// and this firm's waiting invites to the caller's address are closed (the
// link now exists).

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizedSessionEmail } from "@/lib/email-address";
import { getDefaultOrganizationId, getOrCreateDefaultOrganization } from "@/lib/organizations";
import { sendLinkConfirmation } from "./link-emails";
import type { JoinTarget } from "./join-link";

export type ConnectState =
  | { kind: "open"; companyName: string | null }
  | { kind: "own_firm" }
  | { kind: "already" }
  | { kind: "other_firm"; firmName: string };

export class ConnectError extends Error {}

async function isMemberOfFirm(userId: string, firmId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("firm_members")
    .select("id")
    .eq("firm_id", firmId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ConnectError(error.message);
  return data != null;
}

async function activeLinkOf(organizationId: string): Promise<{ firmId: string; firmName: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("firm_id, firms(name)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new ConnectError(error.message);
  if (!data) return null;
  const firms = data.firms as { name: string } | { name: string }[] | null;
  return {
    firmId: data.firm_id as string,
    firmName: (Array.isArray(firms) ? firms[0] : firms)?.name ?? "another accounting firm",
  };
}

async function companyNameOf(organizationId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new ConnectError(error.message);
  return (data?.name as string | undefined) ?? null;
}

/** What the join page offers the signed-in user. Reads only; creates nothing. */
export async function connectState(user: User, target: JoinTarget): Promise<ConnectState> {
  if (await isMemberOfFirm(user.id, target.firmId)) return { kind: "own_firm" };
  const organizationId = await getDefaultOrganizationId(user.id);
  if (!organizationId) return { kind: "open", companyName: null };
  const active = await activeLinkOf(organizationId);
  if (active?.firmId === target.firmId) return { kind: "already" };
  if (active) return { kind: "other_firm", firmName: active.firmName };
  return { kind: "open", companyName: await companyNameOf(organizationId) };
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; reason: "own_firm" | "already" | "other_firm" | "failed" };

/** "Yes, share": links the caller's company to the firm. */
export async function connectToFirm(user: User, target: JoinTarget): Promise<ConnectResult> {
  if (await isMemberOfFirm(user.id, target.firmId)) return { ok: false, reason: "own_firm" };
  const organizationId = await getOrCreateDefaultOrganization(user.id);
  if (!organizationId) return { ok: false, reason: "failed" };
  const active = await activeLinkOf(organizationId);
  if (active) return { ok: false, reason: active.firmId === target.firmId ? "already" : "other_firm" };

  const email = normalizedSessionEmail(user) ?? (user.email ?? "").toLowerCase();
  const companyName = (await companyNameOf(organizationId)) ?? email;
  const now = new Date().toISOString();
  const db = getSupabaseAdmin();
  const { error } = await db.from("firm_clients").insert({
    firm_id: target.firmId,
    organization_id: organizationId,
    direction: "firm",
    status: "active",
    client_name: companyName.slice(0, 200),
    invited_email: email.slice(0, 254),
    accepted_by: user.id,
    accepted_at: now,
    via_join_link: true,
  });
  if (error) {
    // 23505 on firm_clients_active_org_unique: another tab or person
    // connected the company a moment ago.
    if (error.code === "23505") {
      const now2 = await activeLinkOf(organizationId);
      return { ok: false, reason: now2?.firmId === target.firmId ? "already" : "other_firm" };
    }
    console.error("[firm-connect] insert failed", error.code);
    return { ok: false, reason: "failed" };
  }

  // Best effort from here: the link is made.
  const closed = { status: "revoked", revoked_at: now, invite_token_hash: null };
  const [withdrawn, superseded] = await Promise.all([
    // A request the company sent to another accountant.
    db
      .from("firm_clients")
      .update(closed)
      .eq("organization_id", organizationId)
      .eq("direction", "client")
      .eq("status", "invited"),
    // This firm's own waiting invites to the same address.
    email
      ? db
          .from("firm_clients")
          .update(closed)
          .eq("firm_id", target.firmId)
          .eq("direction", "firm")
          .eq("status", "invited")
          .eq("invited_email", email)
      : Promise.resolve({ error: null }),
  ]);
  if (withdrawn.error) console.error("[firm-connect] withdraw requests failed", withdrawn.error.code);
  if (superseded.error) console.error("[firm-connect] close invites failed", superseded.error.code);
  await sendLinkConfirmation({ clientUserId: user.id, firmId: target.firmId });
  return { ok: true };
}
