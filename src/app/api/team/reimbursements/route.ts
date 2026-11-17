// GET  /api/team/reimbursements — approved outlays not yet paid back, per
//      employee and currency: { groups: ReimbursementGroup[] }. Owners only.
// POST /api/team/reimbursements { receipts: [{ id, updatedAt }] } — marks
//      one group paid back, sent back exactly as GET listed it. Compare-and-
//      set on what the owner saw: the whole group moves only if every
//      receipt is still this company's, owed and unchanged since the list
//      was read; otherwise nothing moves and the answer is 409 "changed"
//      (the screen reloads the list). The bare { receiptIds } of before is
//      refused (400): it would mark whatever the amounts are now.

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

const BodySchema = z.object({
  receipts: z
    .array(
      z.object({
        id: z.string().uuid(),
        // As GET sent it; null only for a row that never had one.
        updatedAt: z.iso.datetime({ offset: true }).nullable(),
      })
    )
    .min(1)
    .max(500)
    .refine((list) => new Set(list.map((r) => r.id)).size === list.length, "duplicate ids"),
});

export async function POST(request: NextRequest) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const parsed = BodySchema.safeParse(await jsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await markReimbursed(guard.user.id, parsed.data.receipts);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true, count: result.value.count }, { headers: NO_STORE });
}
