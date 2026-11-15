// PATCH  /api/team/members/<userId> — the owner changes a colleague's role
//        ("approver" | "member") or approver (a user id, or null = the owners).
// DELETE /api/team/members/<userId> — the owner removes a colleague; their
//        receipts stay with the company.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { removeTeamMember, updateTeamMember } from "@/lib/team/invites";
import { jsonBody, NO_STORE, refusal, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Id = z.string().uuid();
const PatchSchema = z
  .object({
    role: z.enum(["approver", "member"]).optional(),
    approverId: z.string().uuid().nullable().optional(),
  })
  .refine((b) => b.role !== undefined || b.approverId !== undefined, "nothing to change");

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const { userId } = await ctx.params;
  if (!Id.safeParse(userId).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = PatchSchema.safeParse(await jsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await updateTeamMember(guard.user.id, userId, parsed.data);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const { userId } = await ctx.params;
  if (!Id.safeParse(userId).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await removeTeamMember(guard.user.id, userId);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
