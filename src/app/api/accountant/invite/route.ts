// POST /api/accountant/invite — a client company invites its accountant
// (direction 'client', 2026-11-05). Creates a firm_clients row with the
// client's organisation, no firm yet, and a hashed link token, and emails
// the accountant. The accountant accepts at /app/firm-request, signed in
// with that exact, confirmed address. One pending client-sent invite per
// company: a new one replaces the last. Refused while a firm is connected.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { normalizeAddress } from "@/lib/email-address";
import { sendEmail, founderReplyTo } from "@/lib/email/send";
import { clientRequestEmail } from "@/lib/email/templates";
import { absoluteAppUrl } from "@/lib/app-url";
import { inviteExpiry, mintInviteToken, requestAcceptPath } from "@/lib/firm/invites";
import { isAcceptableDisplayName } from "@/lib/firm/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ email: z.string().trim().max(320) });

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The invite carries the company's receipts: only a confirmed account
  // may send one.
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Confirm your email address first." }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  const email = parsed.success ? normalizeAddress(parsed.data.email) : null;
  if (!email) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (email === normalizeAddress(user.email ?? "")) {
    return NextResponse.json({ error: "Enter your accountant's address, not your own." }, { status: 400 });
  }

  const limited = await rateLimit("accountantInvite", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const organizationId = await getOrCreateDefaultOrganization(user.id);
  if (!organizationId) {
    return NextResponse.json({ error: "Couldn't set up your company. Try again." }, { status: 500 });
  }

  const db = getSupabaseAdmin();
  const [{ data: org }, { data: active, error: activeError }] = await Promise.all([
    db.from("organizations").select("name, org_number").eq("id", organizationId).maybeSingle(),
    db.from("firm_clients").select("id").eq("organization_id", organizationId).eq("status", "active").maybeSingle(),
  ]);
  if (activeError) {
    console.error("[/api/accountant/invite] active check failed", activeError.code);
    return NextResponse.json({ error: "Couldn't send the invite. Try again." }, { status: 500 });
  }
  if (active) {
    return NextResponse.json(
      { error: "Your company already shares its receipts with an accountant. Stop sharing first." },
      { status: 409 }
    );
  }

  // One pending request per company: withdraw the previous one.
  const { error: withdrawError } = await db
    .from("firm_clients")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), invite_token_hash: null })
    .eq("organization_id", organizationId)
    .eq("direction", "client")
    .eq("status", "invited");
  if (withdrawError) {
    console.error("[/api/accountant/invite] withdraw failed", withdrawError.code);
    return NextResponse.json({ error: "Couldn't send the invite. Try again." }, { status: 500 });
  }

  // The company name goes into the email subject; a name that looks like a
  // link or an authority is replaced (src/lib/firm/names.ts).
  const typedName = ((org?.name as string | undefined) ?? "").trim();
  const clientName = isAcceptableDisplayName(typedName) ? typedName : "Your client";
  const { token, hash } = mintInviteToken();
  const { data: inserted, error } = await db
    .from("firm_clients")
    .insert({
      direction: "client",
      firm_id: null,
      organization_id: organizationId,
      status: "invited",
      client_name: clientName.slice(0, 200),
      client_org_number: (org?.org_number as string | null | undefined) ?? null,
      invited_email: email,
      invite_token_hash: hash,
      invite_expires_at: inviteExpiry(),
      invited_by: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[/api/accountant/invite] insert failed", error?.code);
    return NextResponse.json({ error: "Couldn't send the invite. Try again." }, { status: 500 });
  }

  const sent = await sendEmail({
    to: email,
    ...clientRequestEmail({ clientName, url: absoluteAppUrl(requestAcceptPath(token)) }),
    replyTo: founderReplyTo(),
    tag: "client_request",
  });
  if (!sent.ok) {
    // The request stays: the accountant also sees it in the firm portal
    // when signed in with this address.
    console.error("[/api/accountant/invite] email failed", sent.reason);
    return NextResponse.json({ ok: true, id: inserted.id, emailed: false }, { status: 201 });
  }
  return NextResponse.json({ ok: true, id: inserted.id, emailed: true }, { status: 201 });
}
