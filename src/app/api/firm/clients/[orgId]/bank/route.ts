// DELETE /api/firm/clients/[orgId]/bank?month=YYYY-MM — removes the
// client's bank lines dated in that month, decisions included: the way out
// of importing the wrong file (or another client's statement). Receipts
// are never touched. Scoped by the organisation that
// requireFirmClientAccess() returned.

import { NextResponse, type NextRequest } from "next/server";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { monthDays } from "@/lib/bank/month";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
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

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { orgId } = await params;
  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const { first, last } = monthDays(month);
  const { data, error } = await getSupabaseAdmin()
    .from("bank_transactions")
    .delete()
    .eq("organization_id", access.organizationId)
    .gte("booked_on", first)
    .lte("booked_on", last)
    .select("id");
  if (error) {
    console.error("[/api/firm/clients/[orgId]/bank] delete failed", error.code);
    return NextResponse.json({ error: "Couldn't remove the lines. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: (data ?? []).length });
}
