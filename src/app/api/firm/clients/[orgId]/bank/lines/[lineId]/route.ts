// PATCH /api/firm/clients/[orgId]/bank/lines/[lineId] — the accountant's
// decision on one bank line:
//   { action: "link", receiptId }    this receipt pays it (e.g. a tip made
//                                    the amounts differ)
//   { action: "no_receipt", reason } a bank fee, a transfer… nothing to ask
//   { action: "clear" }              back to automatic matching
// The line and the receipt must both belong to the organisation that
// requireFirmClientAccess() returned; anything else answers 404.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, isUuid, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { firmVisible } from "@/lib/firm/visibility";
import { NO_RECEIPT_REASONS } from "@/lib/bank/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = NO_RECEIPT_REASONS.map((r) => r.key) as [string, ...string[]];

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), receiptId: z.string().refine(isUuid) }),
  z.object({ action: z.literal("no_receipt"), reason: z.enum(REASONS) }),
  z.object({ action: z.literal("clear") }),
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; lineId: string }> }
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

  const { orgId, lineId } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(lineId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const db = getSupabaseAdmin();
  const body = parsed.data;

  if (body.action === "link") {
    // Only a receipt the firm may see (src/lib/firm/visibility.ts).
    const { data: receipt, error } = await firmVisible(
      db.from("receipts").select("id").eq("id", body.receiptId).eq("organization_id", access.organizationId)
    ).maybeSingle();
    if (error) {
      console.error("[/api/firm/clients/[orgId]/bank/lines] receipt check failed", error.code);
      return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
    }
    if (!receipt) return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const decided =
    body.action === "clear"
      ? { decided_by: null, decided_at: null }
      : { decided_by: ctx.user.id, decided_at: new Date().toISOString() };
  const update = {
    linked_receipt_id: body.action === "link" ? body.receiptId : null,
    no_receipt_reason: body.action === "no_receipt" ? body.reason : null,
    ...decided,
  };

  const { data, error } = await db
    .from("bank_transactions")
    .update(update)
    .eq("id", lineId)
    .eq("organization_id", access.organizationId)
    .select("id");
  if (error) {
    // bank_transactions_linked_receipt_unique: one receipt, one bank line.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This receipt is already linked to another payment." },
        { status: 409 }
      );
    }
    console.error("[/api/firm/clients/[orgId]/bank/lines] update failed", error.code);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  if ((data ?? []).length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
