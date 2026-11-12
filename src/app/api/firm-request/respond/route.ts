// POST /api/firm-request/respond — an accountant answers a client
// company's invite (direction 'client', 2026-11-05). Same two locks as the
// other direction: only the invited address, signed in and confirmed, can
// answer. An accountant whose firm isn't on UnReceipt yet sets it up here
// (firmName): the firm and its first admin are created with the accept.
// Not under /api/firm/: the caller need not be a firm member yet.
//
// A pending firm seat (firm_members row with this address, user_id NULL)
// is never claimed here: any firm admin can add any address, so claiming
// it as a side effect would hand this company's receipts to a firm the
// accountant never chose. The accept is refused (409 "join_firm_first")
// until they join that firm themselves (Join on /app/firm-join, where /firm
// sends them; the firm is shown by name); the request then also waits in
// their firm portal.
//
// Accepting makes the link active, so the company's other client-sent
// requests (to other accountants) are withdrawn. A company already
// connected to a firm is refused before anything is created.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findPendingFirmSeat, getFirmMembership, isUuid } from "@/lib/require-firm";
import { normalizedSessionEmail } from "@/lib/email-address";
import { isInviteExpired } from "@/lib/firm/invites";
import { sendLinkConfirmation } from "@/lib/firm/link-emails";
import { isAcceptableDisplayName } from "@/lib/firm/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  inviteId: z.string().max(64),
  action: z.enum(["accept", "decline"]),
  firmName: z.string().trim().max(200).optional(),
});

type RequestRow = {
  id: string;
  organization_id: string | null;
  status: string;
  direction: string;
  invited_email: string;
  invite_expires_at: string | null;
  invited_by: string | null;
};

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
  const { inviteId, action, firmName } = parsed.data;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("firm_clients")
    .select("id, organization_id, status, direction, invited_email, invite_expires_at, invited_by")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) {
    console.error("[/api/firm-request/respond] read failed", error.code);
    return NextResponse.json({ error: "Couldn't load the invite. Try again." }, { status: 500 });
  }
  const row = data as RequestRow | null;
  if (
    !row ||
    row.status !== "invited" ||
    row.direction !== "client" ||
    !row.organization_id ||
    isInviteExpired(row.invite_expires_at)
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Invites are stored normalised (normalizeAddress): a dotted Gmail or a
  // googlemail.com sign-in must match the same mailbox.
  const signedInAs = normalizedSessionEmail(user);
  if (!signedInAs || signedInAs !== row.invited_email) {
    return NextResponse.json({ error: "wrong_account" }, { status: 403 });
  }

  if (action === "decline") {
    const { error: declineError } = await db
      .from("firm_clients")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), invite_token_hash: null })
      .eq("id", row.id)
      .eq("status", "invited");
    if (declineError) {
      console.error("[/api/firm-request/respond] decline failed", declineError.code);
      return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "revoked" });
  }

  const organizationId = row.organization_id;
  const alreadyConnected = () =>
    NextResponse.json({ error: "This company already shares its receipts with another firm." }, { status: 409 });

  const membership = await getFirmMembership(user.id);
  if (!membership) {
    const seat = await findPendingFirmSeat(user);
    if (seat) {
      return NextResponse.json(
        {
          error: "join_firm_first",
          firmName: seat.firmName,
          message: `${seat.firmName} added you to its team. Open the firm portal to join it, then accept this request there.`,
        },
        { status: 409 }
      );
    }
  }

  // One active firm per company: check before a new firm is created, so a
  // refusal never leaves an empty firm behind.
  const { data: active, error: activeError } = await db
    .from("firm_clients")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (activeError) {
    console.error("[/api/firm-request/respond] active check failed", activeError.code);
    return NextResponse.json({ error: "Couldn't accept. Try again." }, { status: 500 });
  }
  if (active) return alreadyConnected();

  let firmId: string;
  let createdFirmId: string | null = null;
  if (membership) {
    firmId = membership.firmId;
  } else {
    // First accept from an accountant whose firm isn't on UnReceipt yet.
    if (!firmName || firmName.length < 2) {
      return NextResponse.json({ error: "firm_name_required" }, { status: 400 });
    }
    // The name goes into the invites this firm will email from our domain.
    if (!isAcceptableDisplayName(firmName)) {
      return NextResponse.json({ error: "firm_name_invalid" }, { status: 400 });
    }
    // The firm starts in the client's country (SE when unknown).
    const { data: org } = await db.from("organizations").select("country").eq("id", organizationId).maybeSingle();
    const country =
      typeof org?.country === "string" && /^[A-Z]{2}$/.test(org.country) ? org.country : "SE";
    const { data: firm, error: firmError } = await db
      .from("firms")
      .insert({ name: firmName, country })
      .select("id")
      .single();
    if (firmError || !firm) {
      console.error("[/api/firm-request/respond] firm insert failed", firmError?.code);
      return NextResponse.json({ error: "Couldn't set up your firm. Try again." }, { status: 500 });
    }
    const { error: memberError } = await db.from("firm_members").insert({
      firm_id: firm.id,
      user_id: user.id,
      // Stored normalised, like every seat (normalizeAddress).
      email: signedInAs,
      role: "admin",
      claimed_at: new Date().toISOString(),
    });
    if (memberError) {
      // Don't leave an empty firm behind.
      await db.from("firms").delete().eq("id", firm.id);
      console.error("[/api/firm-request/respond] member insert failed", memberError.code);
      return NextResponse.json({ error: "Couldn't set up your firm. Try again." }, { status: 500 });
    }
    firmId = firm.id as string;
    createdFirmId = firmId;
  }

  const { data: updated, error: acceptError } = await db
    .from("firm_clients")
    .update({
      firm_id: firmId,
      status: "active",
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
      invite_token_hash: null,
    })
    .eq("id", row.id)
    .eq("status", "invited")
    .select("id")
    .maybeSingle();
  if (acceptError || !updated) {
    // A firm made for this accept and left without a client goes again
    // (its admin row cascades).
    if (createdFirmId) await db.from("firms").delete().eq("id", createdFirmId);
    if (acceptError?.code === "23505") return alreadyConnected();
    if (acceptError) {
      console.error("[/api/firm-request/respond] accept failed", acceptError.code);
      return NextResponse.json({ error: "Couldn't accept. Try again." }, { status: 500 });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // The company now has its accountant: its other requests are withdrawn.
  const { error: withdrawError } = await db
    .from("firm_clients")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), invite_token_hash: null })
    .eq("organization_id", organizationId)
    .eq("direction", "client")
    .eq("status", "invited")
    .neq("id", row.id);
  if (withdrawError) console.error("[/api/firm-request/respond] withdraw others failed", withdrawError.code);

  if (row.invited_by) await sendLinkConfirmation({ clientUserId: row.invited_by, firmId });
  return NextResponse.json({ ok: true, status: "active" });
}
