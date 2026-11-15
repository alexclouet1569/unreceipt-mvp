// GET  /api/team-join — the team invites waiting for the signed-in,
//      confirmed address: { invites: [{ id, companyName, role }] }.
// POST /api/team-join { action: "join" | "decline", inviteId } — the answer
//      on /app/team-join (or in the iPhone app). The ONLY place a team
//      invite becomes a membership: any owner can type any address, so
//      nobody joins a company by being invited (src/lib/team/invites.ts).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { acceptTeamInvite, declineTeamInvite, findWaitingTeamInvites } from "@/lib/team/invites";
import { jsonBody, NO_STORE, refusal, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await teamGuard(request, { write: false });
  if (!guard.ok) return guard.response;
  const invites = await findWaitingTeamInvites(guard.user);
  return NextResponse.json({ invites }, { headers: NO_STORE });
}

const BodySchema = z.object({ action: z.enum(["join", "decline"]), inviteId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const guard = await teamGuard(request, { write: true, limit: "teamAction" });
  if (!guard.ok) return guard.response;
  const parsed = BodySchema.safeParse(await jsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (parsed.data.action === "decline") {
    const result = await declineTeamInvite(guard.user, parsed.data.inviteId);
    if (!result.ok) return refusal(result);
    return NextResponse.json({ ok: true, redirect: "/app" }, { headers: NO_STORE });
  }
  const result = await acceptTeamInvite(guard.user, parsed.data.inviteId);
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true, companyName: result.companyName, redirect: "/app" }, { headers: NO_STORE });
}
