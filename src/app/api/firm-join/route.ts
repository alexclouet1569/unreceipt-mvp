// POST /api/firm-join — the user's answer on /app/firm-join to "<firm> added
// you to its team". The ONLY place a waiting firm seat (firm_members row
// with this confirmed address, user_id NULL) is claimed: any firm admin can
// add any address as staff, so being added never makes anyone a member by
// itself, and a page load never claims (AGENTS.md, firm portal rule 4).
//
//   { action: "join" }    claims the seat → { redirect: "/firm" }
//   { action: "decline" } removes the waiting seats for this address and
//                         gives the user their own company → { redirect: "/app" }
//
// Not under /api/firm/: the caller isn't a firm member yet. Same-origin
// check like the other answer routes (a JSON POST also needs a preflight
// cross-site, so a third-party page can't make the choice for someone).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import {
  claimPendingFirmSeat,
  declinePendingFirmSeats,
  findPendingFirmSeat,
  getFirmMembership,
} from "@/lib/require-firm";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ action: z.enum(["join", "decline"]) });

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // JSON only: a cross-site <form> can only send form or text/plain bodies,
  // and a cross-site fetch with application/json needs a preflight we never
  // grant. A forced Join would be the very thing this route guards against.
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Already in a firm (a second press, or another tab): nothing to decide.
  if (await getFirmMembership(user.id)) {
    return NextResponse.json({ ok: true, redirect: "/firm" });
  }

  if (parsed.data.action === "join") {
    if (!(await findPendingFirmSeat(user))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const membership = await claimPendingFirmSeat(user);
    if (!membership) {
      return NextResponse.json({ error: "Couldn't join the firm. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, redirect: "/firm" });
  }

  if (!(await declinePendingFirmSeats(user))) {
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  // Their own company now, so /app shows the dashboard instead of asking
  // again (a failed mint is retried by /app itself).
  await getOrCreateDefaultOrganization(user.id);
  return NextResponse.json({ ok: true, redirect: "/app" });
}
