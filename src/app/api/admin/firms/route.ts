// POST /api/admin/firms { name, email } — the founder sets up an accounting
// firm for an accountant from /admin/pilot (instead of the SQL editor, see
// the 2026-11-04 block in supabase/schema.sql): a firms row and an admin
// firm_members row for the address, claimed on her first confirmed sign-in
// (src/lib/require-firm.ts). She is emailed how to sign in. Admin only.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminAuthError, requireAdmin } from "@/lib/require-admin";
import { isSameHost } from "@/lib/same-origin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeAddress } from "@/lib/email-address";
import { isAcceptableDisplayName } from "@/lib/firm/names";
import { founderReplyTo, sendEmail } from "@/lib/email/send";
import { firmWelcomeEmail } from "@/lib/email/templates";
import { absoluteAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().max(320),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw err;
  }
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the firm's name and the accountant's email." }, { status: 400 });
  const name = parsed.data.name;
  if (!isAcceptableDisplayName(name)) {
    return NextResponse.json({ error: "That name can't be used (no web or email addresses, no authority names)." }, { status: 400 });
  }
  const email = normalizeAddress(parsed.data.email);
  if (!email) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });

  const db = getSupabaseAdmin();
  // One firm per person: an address already in (or invited to) a firm
  // would claim that one instead.
  const { data: existing, error: existingError } = await db
    .from("firm_members")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (existingError) {
    console.error("[/api/admin/firms] member lookup failed", existingError.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  if (existing) return NextResponse.json({ error: "This address is already in a firm." }, { status: 409 });

  const { data: firm, error: firmError } = await db.from("firms").insert({ name }).select("id").single();
  if (firmError || !firm) {
    console.error("[/api/admin/firms] firm insert failed", firmError?.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  const { error: memberError } = await db.from("firm_members").insert({ firm_id: firm.id, email, role: "admin" });
  if (memberError) {
    // No firm without its admin.
    await db.from("firms").delete().eq("id", firm.id);
    console.error("[/api/admin/firms] member insert failed", memberError.code);
    return NextResponse.json(
      { error: memberError.code === "23505" ? "This address is already in a firm." : "Couldn't save. Try again." },
      { status: memberError.code === "23505" ? 409 : 500 }
    );
  }

  const sent = await sendEmail({
    to: email,
    ...firmWelcomeEmail({ firmName: name, signInUrl: absoluteAppUrl("/app/login?next=/firm") }),
    replyTo: founderReplyTo(),
    tag: "firm_welcome",
  });
  return NextResponse.json({ ok: true, firmId: firm.id, emailed: sent.ok }, { status: 201 });
}
