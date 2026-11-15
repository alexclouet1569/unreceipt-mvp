// POST /api/receipts/<id>/submit { paidBy } — the employee sends their
// checked receipt for approval (src/lib/team/decisions.ts): merchant, amount
// and date must be there; "paidBy" says whether it was their own money (to
// pay back) or the company's. Answers { ok, approvedBy } (who will decide).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { submitReceipt } from "@/lib/team/decisions";
import { jsonBody, NO_STORE, refusal, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ paidBy: z.enum(["employee", "company"]).default("employee") });

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = BodySchema.safeParse((await jsonBody(request)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await submitReceipt(guard.user.id, id, parsed.data.paidBy);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true, approvedBy: result.value.approvedBy }, { headers: NO_STORE });
}
