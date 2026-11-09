// PATCH /api/firm/clients/[orgId]/reminders { weekly } — the firm switches
// the Monday reminder email (src/lib/reminders/weekly.ts) on or off for one
// client. Only this firm's active link to the organisation that
// requireFirmClientAccess() returned is changed.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ weekly: z.boolean() });

export async function PATCH(
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
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { orgId } = await params;
  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .update({ weekly_reminder: parsed.data.weekly })
    .eq("id", access.firmClientId)
    .eq("firm_id", ctx.firmId)
    .eq("organization_id", access.organizationId)
    .eq("status", "active")
    .select("id");
  if (error) {
    console.error("[/api/firm/clients/[orgId]/reminders] update failed", error.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  if ((data ?? []).length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, weekly: parsed.data.weekly });
}
