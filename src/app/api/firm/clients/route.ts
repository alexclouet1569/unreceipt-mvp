// POST /api/firm/clients — an accounting firm invites a client company.
// Creates a firm_clients row (status invited) with a hashed link token and
// emails the client. Firm-only: requireFirmMember() first; the firm id
// comes from the session, never from the body. Rate-limited per staff
// user because it sends email to a typed address.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmMember } from "@/lib/require-firm";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { normalizeAddress } from "@/lib/email-address";
import { createFirmInvite } from "@/lib/firm/create-invite";
import { isAcceptableDisplayName } from "@/lib/firm/names";

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
  // The name goes into an email we send: no web or email addresses, no
  // authority names (src/lib/firm/names.ts), as for a firm's own name.
  if (!isAcceptableDisplayName(parsed.data.client_name)) {
    return NextResponse.json(
      { error: "Use the company's name only, without web or email addresses." },
      { status: 400 }
    );
  }
  const email = normalizeAddress(parsed.data.email);
  if (!email) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const limited = await rateLimit("firmInvite", ctx.user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const outcome = await createFirmInvite({
    firmId: ctx.firmId,
    firmName: ctx.firmName,
    firmCountry: ctx.firmCountry ?? null,
    invitedBy: ctx.user.id,
    clientName: parsed.data.client_name,
    clientOrgNumber: parsed.data.client_org_number,
    email,
  });
  if (!outcome.ok) {
    return NextResponse.json({ error: "Couldn't save the invite. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: outcome.id, emailed: outcome.emailed }, { status: 201 });
}
