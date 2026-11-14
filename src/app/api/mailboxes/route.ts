// GET /api/mailboxes — the caller's connected mailboxes (website cookie or
// iPhone app bearer), for Settings → Your email. Never returns a token or a
// cursor (toSummary() in src/lib/mailboxes/store.ts), plus which providers
// can be connected right now and the per-user limit. The iPhone app reads
// the same body from GET /api/mobile/mailboxes (loadMailboxList()).
//
// 401 signed out · 500 database error · 200 { connections, providers, limit }.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { loadMailboxList } from "@/lib/mailboxes/list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await loadMailboxList(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "list" } });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
