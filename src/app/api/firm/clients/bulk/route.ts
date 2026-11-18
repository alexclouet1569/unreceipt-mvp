// POST /api/firm/clients/bulk { invites: [{ client_name?, email }] } —
// "Invite several": up to MAX_BULK client invites at once, each the same as
// "Add client" (src/lib/firm/create-invite.ts: own row, own link, own
// email). Firm-only (requireFirmMember first; the firm comes from the
// session), same-origin, rate limited per firm (firmInviteBulk) because it
// emails typed addresses. Addresses this firm already invited (still
// waiting) or already works with are skipped, not emailed again. A typed
// company name is checked like a firm's (isAcceptableDisplayName); without
// one, the address stands in for it until the client connects.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { normalizeAddress } from "@/lib/email-address";
import { createFirmInvite } from "@/lib/firm/create-invite";
import { MAX_BULK } from "@/lib/firm/bulk-lines";
import { isAcceptableDisplayName } from "@/lib/firm/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  invites: z
    .array(
      z.object({
        client_name: z.string().trim().max(200).optional(),
        email: z.string().trim().max(320),
      }),
    )
    .min(1)
    .max(MAX_BULK),
});

type Line = { email: string; status: "sent" | "saved" | "skipped" | "invalid" | "bad_name" | "failed" };

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
    return NextResponse.json({ error: `Paste between 1 and ${MAX_BULK} addresses.` }, { status: 400 });
  }

  const limited = await rateLimit("firmInviteBulk", ctx.firmId);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  // One line per address, the first one wins.
  const seen = new Set<string>();
  const lines: Line[] = [];
  const todo: { email: string; name: string }[] = [];
  for (const row of parsed.data.invites) {
    const email = normalizeAddress(row.email);
    if (!email) {
      lines.push({ email: row.email.slice(0, 320), status: "invalid" });
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    // A typed name goes into the email: checked like a firm's own name. An
    // address standing in for a missing name is the client's own.
    const typed = row.client_name && row.client_name.length > 0 ? row.client_name : null;
    if (typed && !isAcceptableDisplayName(typed)) {
      lines.push({ email, status: "bad_name" });
      continue;
    }
    todo.push({ email, name: typed ?? email });
  }

  // Already waiting for this firm, or already its client.
  const known = new Set<string>();
  if (todo.length > 0) {
    const { data, error } = await getSupabaseAdmin()
      .from("firm_clients")
      .select("invited_email")
      .eq("firm_id", ctx.firmId)
      .in("status", ["invited", "active"])
      .in(
        "invited_email",
        todo.map((t) => t.email),
      );
    if (error) {
      console.error("[/api/firm/clients/bulk] read failed", error.code);
      return NextResponse.json({ error: "Couldn't send the invites. Try again." }, { status: 500 });
    }
    for (const r of data ?? []) known.add(r.invited_email as string);
  }

  // A few at a time: each one is a database write and an email.
  const queue = todo.filter((t) => {
    if (!known.has(t.email)) return true;
    lines.push({ email: t.email, status: "skipped" });
    return false;
  });
  for (let i = 0; i < queue.length; i += 5) {
    const batch = queue.slice(i, i + 5);
    const outcomes = await Promise.all(
      batch.map((t) =>
        createFirmInvite({
          firmId: ctx.firmId,
          firmName: ctx.firmName,
          firmCountry: ctx.firmCountry ?? null,
          invitedBy: ctx.user.id,
          clientName: t.name,
          clientOrgNumber: null,
          email: t.email,
        }),
      ),
    );
    outcomes.forEach((o, j) =>
      lines.push({ email: batch[j].email, status: !o.ok ? "failed" : o.emailed ? "sent" : "saved" }),
    );
  }

  return NextResponse.json({ ok: true, lines }, { status: 201 });
}
