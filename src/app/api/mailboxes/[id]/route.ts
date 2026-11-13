// DELETE /api/mailboxes/<id> — "Disconnect". Owner only: the row is looked
// up with the caller's user id, so someone else's mailbox answers 404 like
// one that doesn't exist. Stops push notifications and revokes the grant at
// the provider (best effort, time-boxed), and deletes the row
// (src/lib/mailboxes/teardown.ts). Receipts already saved stay.
//
// Same-origin like the other session routes; Origin is optional because the
// iPhone app (bearer) sends none.
//
// 403 cross-site · 401 signed out · 404 unknown / not the caller's ·
// 500 database error · 200 { ok: true, revoked }.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { isSameHost } from "@/lib/same-origin";
import { getServerUser } from "@/lib/supabase-server";
import { getConnection } from "@/lib/mailboxes/store";
import { disconnectMailbox } from "@/lib/mailboxes/teardown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Up to three provider calls of 8 s each.
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const conn = await getConnection(id, { userId: user.id });
    if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const result = await disconnectMailbox(conn);
    if (!result.deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, revoked: result.revoked });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "disconnect" } });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
