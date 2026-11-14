// GET /api/mobile/mailboxes — the iPhone app's Account → Your email: the
// user's connected Gmail/Outlook mailboxes (never a token or a cursor),
// which providers can be connected right now, and the per-user limit.
// The same body as the website's GET /api/mailboxes (loadMailboxList(),
// typed MobileMailboxes in src/lib/mobile/types.ts). Connecting goes
// through POST /api/mailboxes/connect-link and POST /api/mailboxes/claim,
// disconnecting through DELETE /api/mailboxes/<id>.
//
// 401 signed out · 500 database error · 200 MobileMailboxes.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { loadMailboxList } from "@/lib/mailboxes/list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  try {
    return NextResponse.json(await loadMailboxList(user.id), { headers: NO_STORE });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mobile mailboxes" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
