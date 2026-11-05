// POST /api/accountant/respond — a client accepts or declines an accounting
// firm's invite. The caller must either hold the link token or be signed in
// with the invited address (so an invite also shows up in Settings without
// the link). Accepting links the firm to the caller's default organisation;
// one active firm per company.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";
import { hashInviteToken, isInviteExpired, isInviteTokenShape } from "@/lib/firm/invites";
import { isUuid } from "@/lib/require-firm";
import type { FirmClient } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  inviteId: z.string().max(64),
  action: z.enum(["accept", "decline"]),
  token: z.string().max(64).optional(),
});

type InviteRow = Pick<
  FirmClient,
  "id" | "firm_id" | "status" | "invited_email" | "invite_token_hash" | "invite_expires_at"
>;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(parsed.data.inviteId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { inviteId, action, token } = parsed.data;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("firm_clients")
    .select("id, firm_id, status, invited_email, invite_token_hash, invite_expires_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) {
    console.error("[/api/accountant/respond] read failed", error.code);
    return NextResponse.json({ error: "Couldn't load the invite. Try again." }, { status: 500 });
  }
  const invite = data as InviteRow | null;
  // Anything the caller may not act on looks like it doesn't exist.
  if (!invite || invite.status !== "invited") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const byToken =
    isInviteTokenShape(token) &&
    invite.invite_token_hash !== null &&
    hashInviteToken(token) === invite.invite_token_hash &&
    !isInviteExpired(invite.invite_expires_at);
  const byEmail =
    typeof user.email === "string" &&
    Boolean(user.email_confirmed_at) &&
    user.email.trim().toLowerCase() === invite.invited_email;
  if (!byToken && !byEmail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (action === "decline") {
    const { error: declineError } = await db
      .from("firm_clients")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), invite_token_hash: null })
      .eq("id", invite.id)
      .eq("status", "invited");
    if (declineError) {
      console.error("[/api/accountant/respond] decline failed", declineError.code);
      return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "revoked" });
  }

  const organizationId = await getOrCreateDefaultOrganization(user.id);
  if (!organizationId) {
    return NextResponse.json({ error: "Couldn't set up your company. Try again." }, { status: 500 });
  }

  const { data: updated, error: acceptError } = await db
    .from("firm_clients")
    .update({
      status: "active",
      organization_id: organizationId,
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
      invite_token_hash: null,
    })
    .eq("id", invite.id)
    .eq("status", "invited")
    .select("id")
    .maybeSingle();
  if (acceptError) {
    // 23505 on firm_clients_active_org_unique: another firm is already
    // connected to this company.
    if (acceptError.code === "23505") {
      return NextResponse.json(
        { error: "Your company is already connected to another accounting firm. Disconnect it in Settings first." },
        { status: 409 }
      );
    }
    console.error("[/api/accountant/respond] accept failed", acceptError.code);
    return NextResponse.json({ error: "Couldn't connect. Try again." }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: "active" });
}
