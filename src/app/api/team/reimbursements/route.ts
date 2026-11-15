// GET  /api/team/reimbursements — approved outlays not yet paid back, per
//      employee and currency: { groups: ReimbursementGroup[] }. Owners only.
// POST /api/team/reimbursements { receiptIds } — marks them paid back (only
//      this company's approved, owed receipts move).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadReimbursements, markReimbursed } from "@/lib/team/decisions";
import { jsonBody, NO_STORE, refusal, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await teamGuard(request, { write: false });
  if (!guard.ok) return guard.response;
  const result = await loadReimbursements(guard.user.id);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ groups: result.value }, { headers: NO_STORE });
}

const BodySchema = z.object({ receiptIds: z.array(z.string().uuid()).min(1).max(500) });

export async function POST(request: NextRequest) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const parsed = BodySchema.safeParse(await jsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await markReimbursed(guard.user.id, parsed.data.receiptIds);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true, count: result.value.count }, { headers: NO_STORE });
}
