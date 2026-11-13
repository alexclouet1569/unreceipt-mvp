// SERVER-ONLY. The daily upkeep of connected mailboxes (/api/cron/mailboxes),
// for every provider through its adapter (./types.ts):
//
//   0. Access. Every live connection (active or paused) is paused while
//      its user has no product access and resumed once they have it again
//      (reconcileAccess, ./sync.ts); a paused one is neither renewed nor
//      synced. One paused for RELEASE_PAUSED_AFTER_MS (30 days) is
//      disconnected like a press on Disconnect (disconnectMailbox,
//      ./teardown.ts: row deleted, watch stopped, grant revoked unless
//      another live connection uses the address), so read access is never
//      kept with no end date for an account that stopped using UnReceipt.
//      The pause time is the row's updated_at: nothing writes a paused row
//      until it is resumed.
//   1. Renew push. Every active connection whose watch ends within 48 h (or
//      has none, e.g. its start failed at connect) gets provider.startWatch()
//      again: a Gmail watch lasts 7 days, a Graph subscription about 3. The
//      stored cursor is left alone.
//   2. Catch up. Every active connection not synced for 12 h is synced from
//      its cursor, in case a notification was lost.
//
// A refused refresh token marks the connection needs_reconnect
// (access-token.ts) and counts as handled, not as a failure. No new work
// starts once the budget is spent; what is left waits for the next run (or
// the next notification). Never logs addresses.

import * as Sentry from "@sentry/nextjs";
import { hasProductAccess } from "@/lib/subscription-gate";
import { getAccessToken } from "./access-token";
import { getProvider } from "./providers";
import { listActiveConnections, recordError, updateWatch } from "./store";
import { reconcileAccess, syncConnection } from "./sync";
import { disconnectMailbox } from "./teardown";
import { MailboxProviderError, ReauthRequiredError, type MailboxConnectionRef } from "./types";

export const RENEW_BEFORE_MS = 48 * 60 * 60 * 1000;
export const CATCH_UP_AFTER_MS = 12 * 60 * 60 * 1000;
export const RELEASE_PAUSED_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const SYNC_CONCURRENCY = 4;
const ACCESS_CONCURRENCY = 10;

export type MailboxCronResult = {
  connections: number;
  renewed: number;
  renewFailed: number;
  synced: number;
  syncFailed: number;
  needsReconnect: number;
  skippedUnconfigured: number;
  deferred: number;
  created: number;
  /** Connections left (or set) paused: their user has no product access. */
  paused: number;
  /** Paused connections whose user has access again, active from this run. */
  resumed: number;
  /** Connections paused for 30 days, disconnected by this run. */
  released: number;
};

const time = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

export function needsRenewal(conn: MailboxConnectionRef, now: number): boolean {
  const ends = time(conn.watch_expires_at);
  return !Number.isFinite(ends) || ends < now + RENEW_BEFORE_MS;
}

/** Paused (already, before this run) for RELEASE_PAUSED_AFTER_MS or longer. */
export function pausedTooLong(conn: MailboxConnectionRef, now: number): boolean {
  if (conn.status !== "paused") return false;
  const since = time(conn.updated_at);
  return Number.isFinite(since) && since <= now - RELEASE_PAUSED_AFTER_MS;
}

export function needsCatchUp(conn: MailboxConnectionRef, now: number): boolean {
  const last = time(conn.last_sync_at);
  return !Number.isFinite(last) || last < now - CATCH_UP_AFTER_MS;
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await run(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/**
 * `startBudgetMs`: no new connection is started after this long.
 * `syncDeadline`: epoch ms by which every sync has stopped (it then stores
 * its cursor), inside the caller's maxDuration.
 */
export async function runMailboxMaintenance({
  startedAt = Date.now(),
  startBudgetMs,
  syncDeadline,
}: {
  startedAt?: number;
  startBudgetMs: number;
  syncDeadline: number;
}): Promise<MailboxCronResult> {
  const conns = await listActiveConnections();
  const result: MailboxCronResult = {
    connections: conns.length,
    renewed: 0,
    renewFailed: 0,
    synced: 0,
    syncFailed: 0,
    needsReconnect: 0,
    skippedUnconfigured: 0,
    deferred: 0,
    created: 0,
    paused: 0,
    resumed: 0,
    released: 0,
  };
  const outOfTime = () => Date.now() - startedAt > startBudgetMs;
  const now = startedAt;
  const gone = new Set<string>();
  const configured = conns.filter((conn) => {
    if (getProvider(conn.provider).configured()) return true;
    result.skippedUnconfigured++;
    return false;
  });

  // 0. Access: pause or resume. Asked once per user (up to five
  // mailboxes each), a few at a time.
  const accessOf = new Map<string, boolean>();
  await pool([...new Set(configured.map((c) => c.user_id))], ACCESS_CONCURRENCY, async (userId) => {
    accessOf.set(userId, await hasProductAccess(userId));
  });
  // Kept in list order (oldest first).
  const slots: Array<MailboxConnectionRef | null> = configured.map(() => null);
  await pool(
    configured.map((conn, i) => ({ conn, i })),
    ACCESS_CONCURRENCY,
    async ({ conn, i }) => {
      try {
        const live = await reconcileAccess(conn, { access: accessOf.get(conn.user_id) });
        if (!live) {
          // Still without access 30 days after it was paused: let go of it.
          if (accessOf.get(conn.user_id) === false && pausedTooLong(conn, now)) {
            const { deleted } = await disconnectMailbox(conn);
            if (deleted) {
              result.released++;
              return;
            }
          }
          result.paused++;
          return;
        }
        if (conn.status === "paused") result.resumed++;
        slots[i] = live;
      } catch (err) {
        // Status not written (database blip): left as it was until tomorrow.
        Sentry.captureException(err, { tags: { area: "mailboxes", step: "cron_access", provider: conn.provider } });
        if (conn.status === "active") slots[i] = conn;
      }
    },
  );
  const usable = slots.filter((c): c is MailboxConnectionRef => c !== null);

  // 1. Renew push.
  for (const conn of usable.filter((c) => needsRenewal(c, now))) {
    if (outOfTime()) {
      result.deferred++;
      continue;
    }
    try {
      const token = await getAccessToken(conn);
      const watch = await getProvider(conn.provider).startWatch(conn, token);
      // Renewal keeps the cursor: changes since it are still unread.
      await updateWatch(conn.id, { watchId: watch.watchId, expiresAt: watch.expiresAt });
      result.renewed++;
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        gone.add(conn.id);
        result.needsReconnect++;
        continue;
      }
      result.renewFailed++;
      const code = err instanceof MailboxProviderError ? err.code : "watch_failed";
      await recordError(conn.id, code).catch(() => {});
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "cron_renew", provider: conn.provider } });
    }
  }

  // 2. Catch up.
  const deadline = syncDeadline;
  const stale = usable.filter((c) => !gone.has(c.id) && needsCatchUp(c, now));
  await pool(stale, SYNC_CONCURRENCY, async (conn) => {
    if (outOfTime()) {
      result.deferred++;
      return;
    }
    try {
      const outcome = await syncConnection(conn, { deadline });
      if (!outcome.skipped) {
        result.synced++;
        result.created += outcome.created;
      }
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        result.needsReconnect++;
        return;
      }
      result.syncFailed++;
      Sentry.captureException(err, { tags: { area: "mailboxes", step: "cron_sync", provider: conn.provider } });
    }
  });

  return result;
}

/** The run did no work it was meant to: something systemic (config, provider, database). */
export function systemicFailure(r: MailboxCronResult): boolean {
  const failed = r.renewFailed + r.syncFailed;
  const succeeded = r.renewed + r.synced + r.needsReconnect;
  return failed > 0 && succeeded === 0;
}
