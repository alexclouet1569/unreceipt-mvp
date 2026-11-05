// DELETE /api/firm/clients/[id] — the firm revokes a client link (or
// withdraws a pending invite). Scoped to the caller's firm; a row of
// another firm answers 404.

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

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      invite_token_hash: null,
    })
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .neq("status", "revoked")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[/api/firm/clients/[id]] revoke failed", error.code);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
