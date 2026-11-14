// POST /api/mailboxes/push/google — Gmail's new-mail notifications, pushed
// by our Cloud Pub/Sub subscription. Body (Pub/Sub push format):
//   { message: { data: base64(JSON { emailAddress, historyId }), messageId, … }, subscription }
//
// In order: verify Pub/Sub's OIDC token (src/lib/mailboxes/pubsub-auth.ts;
// 401/403 otherwise), read the address, find the active Gmail connections
// for it, answer 204 at once and sync each one in after(): history since
// its cursor, receipt-like messages only, through the shared ingest. A
// notification whose historyId the cursor already covers is skipped.
//
// Any 2xx acknowledges the message; anything else makes Pub/Sub retry. So
// an unknown address or an unreadable body is 204 too (retrying can't
// help), and only a database failure looking up the address is 503.
// Never logs the address or the historyId.

import * as Sentry from "@sentry/nextjs";
import { after, NextResponse } from "next/server";
import { historyIdAfter, parseGmailNotification } from "@/lib/mailboxes/google";
import { verifyPubSubPush } from "@/lib/mailboxes/pubsub-auth";
import { findActiveConnectionsByEmail } from "@/lib/mailboxes/store";
import { syncConnection } from "@/lib/mailboxes/sync";
import { ReauthRequiredError, type MailboxConnectionRef } from "@/lib/mailboxes/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The syncs run in after() within this budget and stop in time to store
// their cursor; whatever is left is read by the next notification.
export const maxDuration = 300;

const MAX_BODY_BYTES = 64 * 1024;

const ack = () => new NextResponse(null, { status: 204 });

/** The connection's cursor already covers this notification. */
function alreadyRead(conn: MailboxConnectionRef, historyId: string | null): boolean {
  if (!historyId || !conn.cursor || !/^\d{1,20}$/.test(conn.cursor)) return false;
  return !historyIdAfter(historyId, conn.cursor);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const auth = await verifyPubSubPush(request.headers.get("authorization"));
  if (!auth.ok) {
    if (auth.status === 503) {
      Sentry.captureMessage("gmail push not configured", { tags: { area: "mailboxes", step: "push_auth" } });
    }
    return NextResponse.json({ error: auth.status === 503 ? "not_configured" : "unauthorized" }, { status: auth.status });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return ack();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return ack();
  }
  const note = parseGmailNotification(body);
  if (!note) return ack();

  let conns: MailboxConnectionRef[];
  try {
    conns = await findActiveConnectionsByEmail("google", note.emailAddress);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "mailboxes", step: "push_lookup", provider: "google" } });
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }

  const due = conns.filter((conn) => !alreadyRead(conn, note.historyId));
  if (due.length === 0) return ack();

  const deadline = startedAt + (maxDuration - 20) * 1000;
  after(async () => {
    // One at a time: usually one connection per address.
    for (const conn of due) {
      try {
        await syncConnection(conn, { deadline });
      } catch (err) {
        if (!(err instanceof ReauthRequiredError)) {
          Sentry.captureException(err, { tags: { area: "mailboxes", step: "push_sync", provider: "google" } });
        }
      }
    }
  });
  return ack();
}
