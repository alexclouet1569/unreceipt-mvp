// DELETE /api/team/invites/<id> — the owner withdraws a waiting invite.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { revokeTeamInvite } from "@/lib/team/invites";
import { NO_STORE, refusal, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await revokeTeamInvite(guard.user.id, id);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
