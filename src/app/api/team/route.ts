// GET  /api/team — the owner's team: members (role, approver) and waiting invites.
// POST /api/team — the owner invites an address { email, role, approverId? }.
// Owners only (src/lib/team/invites.ts); being invited never makes anyone a
// member: they press Join on /app/team-join.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createTeamInvite, loadTeamView } from "@/lib/team/invites";
import { jsonBody, NO_STORE, refusal, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await teamGuard(request, { write: false });
  if (!guard.ok) return guard.response;
  const view = await loadTeamView(guard.user.id);
  if (!view.ok) return refusal(view);
  return NextResponse.json(view.value, { headers: NO_STORE });
}

const InviteSchema = z.object({
  email: z.string().trim().min(3).max(320),
  role: z.enum(["approver", "member"]).default("member"),
  approverId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await teamGuard(request, { write: true, limit: "teamInvite" });
  if (!guard.ok) return guard.response;
  const parsed = InviteSchema.safeParse(await jsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await createTeamInvite(guard.user, {
    email: parsed.data.email,
    role: parsed.data.role,
    approverId: parsed.data.approverId ?? null,
  });
  if (!result.ok) return refusal(result);
  return NextResponse.json({ ok: true, emailed: result.emailed }, { headers: NO_STORE });
}
