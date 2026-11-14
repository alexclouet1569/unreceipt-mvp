// POST /api/mailboxes/push/microsoft — Microsoft Graph change notifications
// for the inbox subscriptions made by src/lib/mailboxes/microsoft.ts.
//
// Two kinds of request:
//   1. Validation: when a subscription is created, Graph POSTs
//      ?validationToken=… and must get the token back, URL-decoded, as
//      text/plain with 200 within 10 seconds. Nothing else happens.
//   2. Notifications: { value: [{ subscriptionId, clientState, resource,
//      resourceData: { id }, … }] }. Only items whose clientState matches
//      MS_GRAPH_CLIENT_STATE (constant-time) count; the others are dropped
//      and counted in the log. The route answers 202 at once (Graph wants
//      an answer within 3 seconds and retries anything else) and, in
//      after(), finds the active connection by its subscription id
//      (mailbox_connections.watch_id) and syncs it: the delta since its
//      cursor, receipt-like messages only, through the shared ingest. The
//      message named in the notification is not read directly; the delta
//      covers it and anything a lost notification missed. An unknown
//      subscription (disconnected, replaced) is ignored.
//
// Graph sends one notification per new message, often several within a
// second. In one instance, syncs of the same subscription run one after the
// other and at most one waits: everything notified while a sync runs is read
// by the next one. Across instances the per-message claim (claim.ts) keeps
// two syncs from paying for the same message.
//
// Never logs the subscription id, the resource or the clientState.

import * as Sentry from "@sentry/nextjs";
import { after, NextResponse } from "next/server";
import { acceptedSubscriptions, microsoftProvider } from "@/lib/mailboxes/microsoft";
import { findActiveConnectionByWatchId } from "@/lib/mailboxes/store";
import { syncConnection } from "@/lib/mailboxes/sync";
import { ReauthRequiredError } from "@/lib/mailboxes/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The syncs run in after() within this budget and stop in time to store
// their cursor; whatever is left is read by the next notification.
export const maxDuration = 300;

const MAX_BODY_BYTES = 1024 * 1024;
// Graph's tokens are short ("Validation: Testing client application
// reachability for subscription Request-Id: <guid>").
const MAX_VALIDATION_TOKEN = 1024;
// A queued sync isn't started with less than this left.
const MIN_SYNC_MS = 60_000;

// Per subscription in this instance: the sync chain's tail, and whether a
// sync is waiting behind the running one.
const chains = new Map<string, { tail: Promise<void>; waiting: boolean }>();

function enqueue(subscriptionId: string, run: () => Promise<void>): Promise<void> {
  const current = chains.get(subscriptionId);
  // The waiting sync starts after this notification arrived: it reads it.
  if (current?.waiting) return current.tail;
  const entry = { tail: Promise.resolve(), waiting: true };
  entry.tail = (current?.tail ?? Promise.resolve())
    .then(async () => {
      entry.waiting = false;
      await run();
    })
    .finally(() => {
      if (chains.get(subscriptionId) === entry) chains.delete(subscriptionId);
    });
  chains.set(subscriptionId, entry);
  return entry.tail;
}

async function syncSubscription(subscriptionId: string, deadline: number, counts: { unknown: number }): Promise<void> {
  if (Date.now() > deadline - MIN_SYNC_MS) return;
  try {
    // Read when the sync starts, so a queued one sees the cursor the
    // previous one stored.
    const conn = await findActiveConnectionByWatchId("microsoft", subscriptionId);
    if (!conn) {
      counts.unknown++;
      return;
    }
    await syncConnection(conn, { deadline });
  } catch (err) {
    if (!(err instanceof ReauthRequiredError)) {
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "push_sync", provider: "microsoft" } });
    }
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!microsoftProvider.configured()) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 1. Subscription validation handshake.
  const validationToken = new URL(request.url).searchParams.get("validationToken");
  if (validationToken !== null) {
    if (validationToken.length === 0 || validationToken.length > MAX_VALIDATION_TOKEN) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }
    return new NextResponse(validationToken, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  }

  // 2. Change notifications.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { ids, refused } = acceptedSubscriptions(body, process.env.MS_GRAPH_CLIENT_STATE ?? "");
  if (refused > 0) console.warn("[mailboxes/push/microsoft] notifications refused", { count: refused });

  if (ids.length > 0) {
    const deadline = startedAt + (maxDuration - 20) * 1000;
    after(async () => {
      const counts = { unknown: 0 };
      // One at a time: a batch usually names one subscription.
      for (const id of ids) await enqueue(id, () => syncSubscription(id, deadline, counts));
      if (counts.unknown > 0) console.warn("[mailboxes/push/microsoft] unknown subscriptions", { count: counts.unknown });
    });
  }
  return new NextResponse(null, { status: 202 });
}
