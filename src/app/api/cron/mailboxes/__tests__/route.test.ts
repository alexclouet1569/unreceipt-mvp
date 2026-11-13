// @vitest-environment node
// GET /api/cron/mailboxes with fake Gmail and Outlook adapters and an
// in-memory database: watch renewal, catch-up sync, reconnects, budgets and
// the 500 on a run that did nothing.

import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeDb } from "@/lib/mailboxes/__tests__/fake-db";

const mocks = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("@/lib/mailboxes/__tests__/fake-db").createFakeDb>,
  // Users without product access (a cancelled subscription).
  noAccess: new Set<string>(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => mocks.db.client.from(table) }),
}));
vi.mock("@/lib/subscription-gate", () => ({
  hasProductAccess: async (userId: string) => !mocks.noAccess.has(userId),
}));
vi.mock("@/lib/mailboxes/google", async () => ({
  googleProvider: (await import("@/lib/mailboxes/__tests__/fake-provider")).fakeProvider,
}));
vi.mock("@/lib/mailboxes/microsoft", async () => {
  const { createFakeProvider } = await import("@/lib/mailboxes/__tests__/fake-provider");
  return { microsoftProvider: { ...createFakeProvider(), id: "microsoft" as const } };
});

import { fakeProvider, resetFakeProvider } from "@/lib/mailboxes/__tests__/fake-provider";
import { microsoftProvider } from "@/lib/mailboxes/microsoft";
import { saveConnection } from "@/lib/mailboxes/store";
import { ReauthRequiredError, MailboxProviderError } from "@/lib/mailboxes/types";
import { runMailboxMaintenance, systemicFailure } from "@/lib/mailboxes/maintenance";
import { GET } from "@/app/api/cron/mailboxes/route";

type Fake = typeof fakeProvider;
const outlook = microsoftProvider as unknown as Fake;

const HOUR = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let n = 0;
async function addConnection(over: Record<string, unknown> = {}, provider: "google" | "microsoft" = "google") {
  const userId = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const saved = await saveConnection(
    { userId, provider, email: `user${n}@example.com`, refreshToken: "1//rt" },
    mocks.db.client as unknown as SupabaseClient,
  );
  if (!saved.ok) throw new Error("not saved");
  const row = mocks.db.tables.mailbox_connections.find((r) => r.id === saved.conn.id)!;
  Object.assign(row, {
    cursor: "1500",
    watch_expires_at: iso(6 * 24 * HOUR),
    last_sync_at: iso(-1 * HOUR),
    ...over,
  });
  return row;
}

const idsOf = (calls: unknown[][]) => calls.map((args) => (args[0] as { id: string }).id);

const cron = (auth = "Bearer test-cron-secret") =>
  GET(new Request("https://app.unreceipt.com/api/cron/mailboxes", { headers: { authorization: auth } }));

beforeEach(() => {
  process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
  process.env.CRON_SECRET = "test-cron-secret";
  mocks.db = createFakeDb();
  mocks.noAccess = new Set();
  resetFakeProvider(fakeProvider);
  resetFakeProvider(outlook);
});

describe("GET /api/cron/mailboxes", () => {
  it("refuses a call without the cron secret", async () => {
    expect((await cron("Bearer nope")).status).toBe(401);
  });

  it("renews watches ending within 48 h (or missing) and keeps the cursor", async () => {
    const soon = await addConnection({ watch_expires_at: iso(24 * HOUR) });
    const none = await addConnection({ watch_expires_at: null });
    const later = await addConnection();
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connections: 3, renewed: 2, synced: 0, renewFailed: 0 });
    const renewedIds = idsOf(fakeProvider.startWatch.mock.calls);
    expect(renewedIds.sort()).toEqual([soon.id, none.id].sort());
    expect(renewedIds).not.toContain(later.id);
    expect(soon).toMatchObject({ watch_expires_at: "2026-11-20T00:00:00.000Z", cursor: "1500" });
    expect(fakeProvider.startWatch).toHaveBeenCalledWith(expect.objectContaining({ id: soon.id }), "ya29.fresh");
  });

  it("catches up connections not synced for 12 h, through their own provider", async () => {
    const stale = await addConnection({ last_sync_at: iso(-13 * HOUR) });
    const never = await addConnection({ last_sync_at: null });
    const fresh = await addConnection();
    const ms = await addConnection({ last_sync_at: iso(-20 * HOUR) }, "microsoft");
    const res = await cron();
    expect(await res.json()).toMatchObject({ synced: 3, syncFailed: 0, created: 3 });
    const synced = idsOf(fakeProvider.sync.mock.calls);
    expect(synced.sort()).toEqual([stale.id, never.id].sort());
    expect(outlook.sync).toHaveBeenCalledWith(expect.objectContaining({ id: ms.id }), "ya29.fresh", {
      deadline: expect.any(Number),
    });
    expect(stale.cursor).toBe("1005");
    expect(fresh.cursor).toBe("1500");
    expect(Date.parse(stale.last_sync_at as string)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("leaves connections that need reconnecting alone", async () => {
    await addConnection({ status: "needs_reconnect", watch_expires_at: null, last_sync_at: null });
    const res = await cron();
    expect(await res.json()).toMatchObject({ connections: 0, renewed: 0, synced: 0 });
    expect(fakeProvider.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("marks a revoked grant needs_reconnect and doesn't count it as a failure", async () => {
    const gone = await addConnection({ watch_expires_at: null, last_sync_at: null });
    fakeProvider.refreshAccessToken.mockRejectedValue(new ReauthRequiredError("google"));
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ needsReconnect: 1, renewFailed: 0, syncFailed: 0 });
    expect(gone).toMatchObject({ status: "needs_reconnect", last_error: "reauth_required" });
    // Not synced after the renewal found the grant gone.
    expect(fakeProvider.sync).not.toHaveBeenCalled();
  });

  it("records a failed renewal and still catches up the others", async () => {
    const bad = await addConnection({ watch_expires_at: null });
    await addConnection({ last_sync_at: null });
    fakeProvider.startWatch.mockRejectedValueOnce(new MailboxProviderError("watch_failed", 403));
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ renewFailed: 1, synced: 1 });
    expect(bad.last_error).toBe("watch_failed");
  });

  it("answers 500 when every attempt failed", async () => {
    await addConnection({ watch_expires_at: null, last_sync_at: null });
    await addConnection({ watch_expires_at: null, last_sync_at: null });
    fakeProvider.startWatch.mockRejectedValue(new MailboxProviderError("watch_failed", 500));
    fakeProvider.sync.mockRejectedValue(new MailboxProviderError("gmail_history_failed", 500));
    const res = await cron();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "failed", renewFailed: 2, syncFailed: 2 });
  });

  it("answers 500 when the connections can't be read", async () => {
    mocks.db.failNext.mailbox_connections = { code: "57014", message: "timeout" };
    expect((await cron()).status).toBe(500);
  });

  it("answers 200 with nothing to do", async () => {
    await addConnection();
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connections: 1, renewed: 0, synced: 0 });
  });

  it("skips providers that aren't configured", async () => {
    await addConnection({ watch_expires_at: null, last_sync_at: null }, "microsoft");
    outlook.configured.mockReturnValue(false);
    const res = await cron();
    expect(await res.json()).toMatchObject({ skippedUnconfigured: 1, renewed: 0, synced: 0 });
    expect(outlook.startWatch).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/mailboxes and product access", () => {
  it("pauses a mailbox whose user has no access: no renewal, no sync", async () => {
    const lapsed = await addConnection({ watch_expires_at: null, last_sync_at: null });
    const paying = await addConnection({ last_sync_at: null });
    mocks.noAccess.add(lapsed.user_id as string);
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connections: 2, paused: 1, resumed: 0, renewed: 0, synced: 1 });
    expect(lapsed.status).toBe("paused");
    expect(paying.status).toBe("active");
    expect(fakeProvider.startWatch).not.toHaveBeenCalled();
    expect(idsOf(fakeProvider.sync.mock.calls)).toEqual([paying.id]);
  });

  it("leaves a paused mailbox paused while access is still missing", async () => {
    const paused = await addConnection({ status: "paused", last_sync_at: null });
    mocks.noAccess.add(paused.user_id as string);
    const res = await cron();
    expect(await res.json()).toMatchObject({ connections: 1, paused: 1, resumed: 0, synced: 0 });
    expect(paused.status).toBe("paused");
    expect(fakeProvider.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("disconnects a mailbox paused for 30 days and revokes its grant", async () => {
    const old = await addConnection({ status: "paused", updated_at: iso(-31 * 24 * HOUR) });
    const recent = await addConnection({ status: "paused", updated_at: iso(-29 * 24 * HOUR) });
    mocks.noAccess.add(old.user_id as string);
    mocks.noAccess.add(recent.user_id as string);
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connections: 2, released: 1, paused: 1 });
    const ids = mocks.db.tables.mailbox_connections.map((r) => r.id);
    expect(ids).toEqual([recent.id]);
    expect(fakeProvider.revoke).toHaveBeenCalledTimes(1);
    expect(fakeProvider.sync).not.toHaveBeenCalled();
  });

  it("keeps the shared grant when another account still uses the address", async () => {
    const old = await addConnection({ status: "paused", updated_at: iso(-40 * 24 * HOUR) });
    const other = await addConnection({ email: old.email });
    mocks.noAccess.add(old.user_id as string);
    const res = await cron();
    expect(await res.json()).toMatchObject({ released: 1 });
    expect(mocks.db.tables.mailbox_connections.map((r) => r.id)).toEqual([other.id]);
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
  });

  it("never disconnects a paused mailbox whose user has access again", async () => {
    const back = await addConnection({ status: "paused", updated_at: iso(-90 * 24 * HOUR) });
    const res = await cron();
    expect(await res.json()).toMatchObject({ released: 0, resumed: 1 });
    expect(back.status).toBe("active");
  });

  it("resumes a paused mailbox once its user has access again, renews it and catches up", async () => {
    const back = await addConnection({ status: "paused", watch_expires_at: iso(-24 * HOUR), last_sync_at: iso(-72 * HOUR) });
    const res = await cron();
    expect(await res.json()).toMatchObject({ connections: 1, paused: 0, resumed: 1, renewed: 1, synced: 1 });
    expect(back.status).toBe("active");
    expect(back.cursor).toBe("1005");
  });

  it("never resumes a mailbox that needs reconnecting", async () => {
    const stuck = await addConnection({ status: "needs_reconnect", last_sync_at: null });
    await cron();
    expect(stuck.status).toBe("needs_reconnect");
  });
});

describe("runMailboxMaintenance budget", () => {
  it("starts no new connection once the budget is spent", async () => {
    await addConnection({ watch_expires_at: null, last_sync_at: null });
    await addConnection({ watch_expires_at: null, last_sync_at: null });
    const out = await runMailboxMaintenance({ startedAt: Date.now() - 1000, startBudgetMs: 0, syncDeadline: Date.now() });
    expect(out).toMatchObject({ renewed: 0, synced: 0, deferred: 4 });
    expect(systemicFailure(out)).toBe(false);
    expect(fakeProvider.startWatch).not.toHaveBeenCalled();
  });
});
