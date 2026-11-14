// POST /api/firm/clients — an accounting firm invites a client company.
// Creates a firm_clients row (status invited) with a hashed link token and
// emails the client. Firm-only: requireFirmMember() first; the firm id
// comes from the session, never from the body. Rate-limited per staff
// user because it sends email to a typed address.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { normalizeAddress } from "@/lib/email-address";
import { sendEmail, founderReplyTo } from "@/lib/email/send";
import { firmInviteEmail } from "@/lib/email/templates";
import { absoluteAppUrl } from "@/lib/app-url";
import { inviteAcceptPath, inviteExpiry, mintInviteToken } from "@/lib/firm/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  client_name: z.string().trim().min(1, "Enter the company name").max(200),
  client_org_number: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  email: z.string().trim().max(320),
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let ctx;
  try {
    ctx = await requireFirmMember();
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form." },
      { status: 400 }
    );
  }
  const email = normalizeAddress(parsed.data.email);
  if (!email) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const limited = await rateLimit("firmInvite", ctx.user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const { token, hash } = mintInviteToken();
  const db = getSupabaseAdmin();
  const { data: inserted, error } = await db
    .from("firm_clients")
    .insert({
      firm_id: ctx.firmId,
      status: "invited",
      client_name: parsed.data.client_name,
      client_org_number: parsed.data.client_org_number,
      invited_email: email,
      invite_token_hash: hash,
      invite_expires_at: inviteExpiry(),
      invited_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[/api/firm/clients] insert failed", error?.code);
    return NextResponse.json({ error: "Couldn't save the invite. Try again." }, { status: 500 });
  }

  const content = firmInviteEmail({
    firmName: ctx.firmName,
    clientName: parsed.data.client_name,
    url: absoluteAppUrl(inviteAcceptPath(token)),
  });
  const sent = await sendEmail({
    to: email,
    ...content,
    replyTo: founderReplyTo(),
    tag: "firm_invite",
  });
  if (!sent.ok) {
    // The invite stays: the client can still accept from Settings by
    // email match, and the firm can resend later.
    console.error("[/api/firm/clients] invite email failed", sent.reason);
    return NextResponse.json(
      { ok: true, id: inserted.id, emailed: false },
      { status: 201 }
    );
  }
  return NextResponse.json({ ok: true, id: inserted.id, emailed: true }, { status: 201 });
}
