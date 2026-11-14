// @vitest-environment node
// POST /api/mailboxes/push/microsoft: Graph's validation handshake, the
// clientState check, the subscription id mapped to its active connection
// (mailbox_connections.watch_id), 202 at once and the sync queued with
// after(); syncs of one subscription run one after the other.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/mailboxes/__tests__/fake-db";

const STATE = "client-state-0123456789abcdef";
const SUB = "7f105c7d-2dc5-4530-97cd-4e7ae6534c07";
const URL_BASE = "https://app.unreceipt.com/api/mailboxes/push/microsoft";

const mocks = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("@/lib/mailboxes/__tests__/fake-db").createFakeDb>,
  sync: vi.fn(),
  afterTasks: [] as Promise<unknown>[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => mocks.db.client.from(table) }),
}));
vi.mock("@/lib/mailboxes/sync", () => ({ syncConnection: mocks.sync }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    mocks.afterTasks.push(Promise.resolve().then(task));
  },
}));

import { POST } from "@/app/api/mailboxes/push/microsoft/route";

const conn = (over: Record<string, unknown> = {}) => ({
  id: "conn-1",
  user_id: "11111111-1111-4111-8111-111111111111",
  provider: "microsoft",
  email: "anna@outlook.com",
  refresh_token_enc: "v1.secret",
  status: "active",
  cursor: null,
  watch_id: SUB,
  watch_expires_at: "2026-11-16T00:00:00.000Z",
  last_sync_at: null,
  last_receipt_at: null,
  last_error: null,
  created_at: "2026-11-13T00:00:00.000Z",
  updated_at: "2026-11-13T00:00:00.000Z",
  ...over,
});

const note = (subscriptionId: string, clientState: string) => ({
  subscriptionId,
  subscriptionExpirationDateTime: "2026-11-16T00:00:00+00:00",
  changeType: "created",
  resource: "Users/abc/Messages/AAMkAD=",
  resourceData: { "@odata.type": "#Microsoft.Graph.Message", id: "AAMkAD=" },
  clientState,
  tenantId: "tenant",
});

const notify = (items: unknown[]) =>
  POST(new Request(URL_BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: items }) }));

beforeEach(() => {
  process.env.MS_OAUTH_CLIENT_ID = "client";
  process.env.MS_OAUTH_CLIENT_SECRET = "secret";
  process.env.MS_GRAPH_CLIENT_STATE = STATE;
  mocks.db = createFakeDb({ mailbox_connections: [conn()] });
  mocks.afterTasks = [];
  mocks.sync.mockReset();
  mocks.sync.mockResolvedValue({ skipped: false, advanced: true, cursor: null, processed: 0, created: 0 });
});

describe("validation handshake", () => {
  it("echoes the decoded validationToken as text/plain", async () => {
    const res = await POST(
      new Request(
        `${URL_BASE}?validationToken=Validation%3a+Testing+client+application+reachability+for+subscription+Request-Id%3a+abc-123`,
        { method: "POST", headers: { "content-type": "text/plain" } },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("Validation: Testing client application reachability for subscription Request-Id: abc-123");
    expect(mocks.afterTasks).toHaveLength(0);
  });

  it("refuses an oversized token, and answers 404 while Outlook isn't configured", async () => {
    const long = await POST(new Request(`${URL_BASE}?validationToken=${"a".repeat(2000)}`, { method: "POST" }));
    expect(long.status).toBe(400);
    delete process.env.MS_GRAPH_CLIENT_STATE;
    const res = await POST(new Request(`${URL_BASE}?validationToken=abc`, { method: "POST" }));
    expect(res.status).toBe(404);
  });
});

describe("notifications", () => {
  it("answers 202 at once and syncs the subscription's connection in after()", async () => {
    const res = await notify([note(SUB, STATE), note(SUB, STATE)]);
    expect(res.status).toBe(202);
    expect(mocks.afterTasks).toHaveLength(1);
    await Promise.all(mocks.afterTasks);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    const [synced, opts] = mocks.sync.mock.calls[0];
    expect(synced).toMatchObject({ id: "conn-1", watch_id: SUB, provider: "microsoft" });
    // The token never leaves the store.
    expect(synced).not.toHaveProperty("refresh_token_enc");
    expect(opts.deadline).toBeGreaterThan(Date.now());
  });

  it("ignores items with a wrong clientState", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await notify([note(SUB, "not-the-secret"), { subscriptionId: SUB }]);
    expect(res.status).toBe(202);
    expect(mocks.afterTasks).toHaveLength(0);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[mailboxes/push/microsoft] notifications refused", { count: 2 });
    // Nothing that identifies the mailbox is logged.
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SUB);
    warn.mockRestore();
  });

  it("ignores unknown, replaced or inactive subscriptions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.db = createFakeDb({
      mailbox_connections: [conn({ status: "needs_reconnect" }), conn({ id: "conn-2", provider: "google", watch_id: "aaaa-bbbb" })],
    });
    expect((await notify([note(SUB, STATE), note("aaaa-bbbb", STATE), note("cccc-dddd", STATE)])).status).toBe(202);
    await Promise.all(mocks.afterTasks);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[mailboxes/push/microsoft] unknown subscriptions", { count: 3 });
    warn.mockRestore();
  });

  it("refuses a body that isn't JSON", async () => {
    const res = await POST(new Request(URL_BASE, { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("runs syncs of one subscription one after the other, with at most one waiting", async () => {
    let release!: () => void;
    let running = 0;
    let maxRunning = 0;
    mocks.sync.mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      if (mocks.sync.mock.calls.length === 1) await new Promise<void>((r) => (release = r));
      running--;
      return { skipped: false, advanced: true, cursor: null, processed: 0, created: 0 };
    });
    await notify([note(SUB, STATE)]);
    // Let the first sync start (lookup + sync call).
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(1));
    await notify([note(SUB, STATE)]);
    await notify([note(SUB, STATE)]);
    await notify([note(SUB, STATE)]);
    release();
    await Promise.all(mocks.afterTasks);
    // The first, then one for everything notified meanwhile.
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
  });
});
