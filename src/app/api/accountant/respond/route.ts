// POST /api/accountant/respond — a client accepts or declines an accounting
// firm's invite (direction 'firm'). Two locks: the invite went to one
// address, and only that address, signed in and confirmed, can answer it.
// The link token alone is not enough (since 2026-11-05): someone who opens
// the email while signed in to another account gets "wrong_account".
// Accepting links the firm to the caller's default organisation; one active
// firm per company. The client then gets a confirmation email.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";
import { isInviteExpired } from "@/lib/firm/invites";
import { sendLinkConfirmation } from "@/lib/firm/link-emails";
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
  "id" | "firm_id" | "status" | "invited_email" | "invite_expires_at" | "direction"
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
  const { inviteId, action } = parsed.data;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("firm_clients")
    .select("id, firm_id, status, invited_email, invite_expires_at, direction")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) {
    console.error("[/api/accountant/respond] read failed", error.code);
    return NextResponse.json({ error: "Couldn't load the invite. Try again." }, { status: 500 });
  }
  const invite = data as InviteRow | null;
  // Anything the caller may not act on looks like it doesn't exist.
  if (!invite || invite.status !== "invited" || invite.direction !== "firm") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (isInviteExpired(invite.invite_expires_at)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const signedInAs =
    typeof user.email === "string" && user.email_confirmed_at
      ? user.email.trim().toLowerCase()
      : null;
  if (signedInAs !== invite.invited_email) {
    return NextResponse.json({ error: "wrong_account" }, { status: 403 });
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
        { error: "Your company is already connected to another accounting firm. Stop sharing with it in Settings first." },
        { status: 409 }
      );
    }
    console.error("[/api/accountant/respond] accept failed", acceptError.code);
    return NextResponse.json({ error: "Couldn't connect. Try again." }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Best effort: the link is made whether or not the email goes out.
  await sendLinkConfirmation({ clientUserId: user.id, firmId: invite.firm_id as string });
  return NextResponse.json({ ok: true, status: "active" });
}
