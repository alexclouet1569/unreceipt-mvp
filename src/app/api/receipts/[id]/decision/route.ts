// POST /api/receipts/<id>/decision { decision, comment? } — an owner or the
// employee's approver answers: "approve", "send_back" or "reject" (the last
// two say why). Someone who may not decide gets 404, like a receipt that
// doesn't exist; a receipt already decided gets 409 (src/lib/team/decisions.ts).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decideReceipt } from "@/lib/team/decisions";
import { jsonBody, NO_STORE, refusal, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  decision: z.enum(["approve", "send_back", "reject"]),
  comment: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = BodySchema.safeParse(await jsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await decideReceipt(guard.user.id, id, parsed.data.decision, parsed.data.comment);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
