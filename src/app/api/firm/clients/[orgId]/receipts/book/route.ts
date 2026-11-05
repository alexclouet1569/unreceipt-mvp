// POST /api/firm/clients/[orgId]/receipts/book { receiptIds, ref?, booked }
// — the firm marks receipts as booked in its own system (or clears the
// mark). Scoped by the organisation that requireFirmClientAccess() returned;
// ids outside it are simply not updated.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, isUuid, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  receiptIds: z.array(z.string()).min(1).max(200),
  ref: z.string().trim().max(60).optional(),
  booked: z.boolean().default(true),
});

export async function POST(
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

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.receiptIds.every(isUuid)) {
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

  const update = parsed.data.booked
    ? {
        booked_at: new Date().toISOString(),
        booked_by: ctx.user.id,
        booked_ref: parsed.data.ref && parsed.data.ref.length > 0 ? parsed.data.ref : null,
      }
    : { booked_at: null, booked_by: null, booked_ref: null };

  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .update(update)
    .in("id", parsed.data.receiptIds)
    .eq("organization_id", access.organizationId)
    .select("id");
  if (error) {
    console.error("[/api/firm/clients/[orgId]/receipts/book] update failed", error.code);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: (data ?? []).length });
}
