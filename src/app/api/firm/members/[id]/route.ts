// DELETE /api/firm/members/[id] — a firm admin removes a colleague (or a
// pending invite). Admins can't remove themselves: the firm must keep one.

import { NextResponse, type NextRequest } from "next/server";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, isUuid, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json({ error: "Only a firm admin can remove people." }, { status: 403 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (id === ctx.memberId) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("firm_members")
    .delete()
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[/api/firm/members/[id]] delete failed", error.code);
    return NextResponse.json({ error: "Couldn't remove. Try again." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
