// POST /api/firm/members — a firm admin adds a colleague by email. The row
// is claimed when that address signs in (requireFirmMember); no email is
// sent, the admin tells them. Admin-only; the firm id is the session's.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeAddress } from "@/lib/email-address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const MAX_FIRM_MEMBERS = 50;

const BodySchema = z.object({
  email: z.string().trim().max(320),
  role: z.enum(["admin", "staff"]).default("staff"),
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
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Only a firm admin can add people." }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the form." }, { status: 400 });
  const email = normalizeAddress(parsed.data.email);
  if (!email) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { count, error: countError } = await db
    .from("firm_members")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", ctx.firmId);
  if (countError) {
    console.error("[/api/firm/members] count failed", countError.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_FIRM_MEMBERS) {
    return NextResponse.json({ error: `A firm can have up to ${MAX_FIRM_MEMBERS} people.` }, { status: 400 });
  }

  const { data, error } = await db
    .from("firm_members")
    .insert({ firm_id: ctx.firmId, email, role: parsed.data.role, invited_by: ctx.user.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That person is already in the firm." }, { status: 409 });
    }
    console.error("[/api/firm/members] insert failed", error.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data?.id }, { status: 201 });
}
