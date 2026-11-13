// @vitest-environment node
// Access tokens, sync and disconnect, with a fake provider and database.

import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("tests pass the fake client explicitly");
  },
}));
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/subscription-gate", () => ({ hasProductAccess: async () => access.allowed }));
vi.mock("@/lib/mailboxes/google", async () => ({
  googleProvider: (await import("./fake-provider")).fakeProvider,
}));

import { fakeProvider, resetFakeProvider } from "./fake-provider";
import { createFakeDb } from "./fake-db";
import { forgetAccessToken, getAccessToken } from "../access-token";
import { saveConnection } from "../store";
import { syncConnection } from "../sync";
import { ACCOUNT_DELETE_BUDGET_MS, disconnectAllMailboxes, disconnectMailbox } from "../teardown";
import { ReauthRequiredError, MailboxProviderError, type MailboxConnectionRef } from "../types";
import { decryptToken } from "../crypto";
import { parkGrant } from "../parked";

const USER = "11111111-1111-4111-8111-111111111111";

let db: ReturnType<typeof createFakeDb>;
let client: SupabaseClient;

async function connect(email = "anna@gmail.com"): Promise<MailboxConnectionRef> {
  const saved = await saveConnection({ userId: USER, provider: "google", email, refreshToken: "1//rt" }, client);
  if (!saved.ok) throw new Error("not saved");
  forgetAccessToken(saved.conn.id);
  return saved.conn;
}

beforeEach(() => {
  process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
  db = createFakeDb();
  client = db.client as unknown as SupabaseClient;
  resetFakeProvider(fakeProvider);
  access.allowed = true;
});

describe("getAccessToken", () => {
  it("refreshes once, then serves the cached token", async () => {
    const conn = await connect();
    expect(await getAccessToken(conn, { supabase: client })).toBe("ya29.fresh");
    expect(await getAccessToken(conn, { supabase: client })).toBe("ya29.fresh");
    expect(fakeProvider.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fakeProvider.refreshAccessToken).toHaveBeenCalledWith("1//rt");
  });

  it("stores a rotated refresh token, encrypted", async () => {
    const conn = await connect();
    fakeProvider.refreshAccessToken.mockResolvedValueOnce({
      accessToken: "at",
      expiresAt: Date.now() + 3600_000,
      refreshToken: "1//rotated",
    } as never);
    await getAccessToken(conn, { supabase: client });
    const stored = db.tables.mailbox_connections[0].refresh_token_enc as string;
    expect(decryptToken(stored, `user:${USER}`)).toBe("1//rotated");
  });

  it("marks the mailbox needs_reconnect when the grant is gone", async () => {
    const conn = await connect();
    fakeProvider.refreshAccessToken.mockRejectedValueOnce(new ReauthRequiredError("google"));
    await expect(getAccessToken(conn, { supabase: client })).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(db.tables.mailbox_connections[0]).toMatchObject({ status: "needs_reconnect", last_error: "reauth_required" });
  });
});

describe("syncConnection", () => {
  it("pauses instead of reading when the user has no product access", async () => {
    const conn = await connect();
    access.allowed = false;
    expect(await syncConnection(conn, {}, { supabase: client })).toEqual({ skipped: true, reason: "paused" });
    expect(fakeProvider.sync).not.toHaveBeenCalled();
    expect(fakeProvider.refreshAccessToken).not.toHaveBeenCalled();
    expect(db.tables.mailbox_connections[0].status).toBe("paused");
  });

  it("resumes a paused mailbox once access is back, and reads from its cursor", async () => {
    const conn = await connect();
    db.tables.mailbox_connections[0].status = "paused";
    const out = await syncConnection({ ...conn, status: "paused" }, {}, { supabase: client });
    expect(out).toMatchObject({ skipped: false, created: 1 });
    expect(fakeProvider.sync).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }), "ya29.fresh", {});
    expect(db.tables.mailbox_connections[0].status).toBe("active");
  });

  it("doesn't resume over a needs_reconnect set meanwhile", async () => {
    const conn = await connect();
    db.tables.mailbox_connections[0].status = "needs_reconnect";
    expect(await syncConnection({ ...conn, status: "paused" }, {}, { supabase: client })).toEqual({
      skipped: true,
      reason: "paused",
    });
    expect(db.tables.mailbox_connections[0].status).toBe("needs_reconnect");
    expect(fakeProvider.sync).not.toHaveBeenCalled();
  });

  it("runs the provider's sync and moves the cursor", async () => {
    const conn = await connect();
    const out = await syncConnection(conn, { backfillDays: 30, maxMessages: 100 }, { supabase: client });
    expect(out).toMatchObject({ skipped: false, advanced: true, created: 1 });
    expect(fakeProvider.sync).toHaveBeenCalledWith(conn, "ya29.fresh", { backfillDays: 30, maxMessages: 100 });
    expect(db.tables.mailbox_connections[0]).toMatchObject({ cursor: "1005", last_error: null });
    expect(db.tables.mailbox_connections[0].last_receipt_at).toBeTruthy();
  });

  it("doesn't move a cursor someone else moved first", async () => {
    const conn = await connect();
    db.tables.mailbox_connections[0].cursor = "2000";
    const out = await syncConnection(conn, {}, { supabase: client });
    expect(out).toMatchObject({ skipped: false, advanced: false });
    expect(db.tables.mailbox_connections[0].cursor).toBe("2000");
  });

  it("skips a mailbox that isn't active and records a provider failure as a code", async () => {
    const conn = await connect();
    expect(await syncConnection({ ...conn, status: "needs_reconnect" }, {}, { supabase: client })).toEqual({
      skipped: true,
      reason: "not_active",
    });
    fakeProvider.sync.mockRejectedValueOnce(new MailboxProviderError("history_gone", 404));
    await expect(syncConnection(conn, {}, { supabase: client })).rejects.toThrow();
    expect(db.tables.mailbox_connections[0].last_error).toBe("history_gone");
  });
});

describe("disconnect", () => {
  it("stops the watch, revokes the grant and deletes the row", async () => {
    const conn = { ...(await connect()), watch_expires_at: "2026-11-20T00:00:00Z" };
    const out = await disconnectMailbox(conn, client);
    expect(out).toEqual({ deleted: true, stopped: true, revoked: true });
    expect(fakeProvider.stopWatch).toHaveBeenCalledWith(conn, "ya29.fresh");
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//rt");
    expect(db.tables.mailbox_connections).toHaveLength(0);
  });

  it("only deletes its row when another account's active connection uses the same Gmail address", async () => {
    // Same Google account, same OAuth client: one grant and one watch for
    // both connections, so a revoke or users.stop would cut the other off.
    const other = "22222222-2222-4222-8222-222222222222";
    const theirs = await saveConnection({ userId: other, provider: "google", email: "Anna@Gmail.com", refreshToken: "1//theirs" }, client);
    if (!theirs.ok) throw new Error("not saved");
    const conn = { ...(await connect()), watch_expires_at: "2026-11-20T00:00:00Z" };
    expect(await disconnectMailbox(conn, client)).toEqual({ deleted: true, stopped: false, revoked: false });
    expect(fakeProvider.stopWatch).not.toHaveBeenCalled();
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
    expect(db.tables.mailbox_connections.map((r) => r.user_id)).toEqual([other]);

    // Theirs needs reconnecting (its grant is already refused): a full release.
    db.tables.mailbox_connections[0].status = "needs_reconnect";
    const again = { ...(await connect()), watch_expires_at: "2026-11-20T00:00:00Z" };
    expect(await disconnectMailbox(again, client)).toEqual({ deleted: true, stopped: true, revoked: true });
  });

  it("releases as asked when it can't tell whether the address is shared", async () => {
    const conn = { ...(await connect()), watch_expires_at: "2026-11-20T00:00:00Z" };
    const realFrom = db.client.from;
    let reads = 0;
    // The token read and the delete go through; the shared-address lookup fails.
    db.client.from = (table: string) => {
      if (table === "mailbox_connections" && ++reads === 3) db.failNext.mailbox_connections = { code: "08006", message: "down" };
      return realFrom(table);
    };
    expect(await disconnectMailbox(conn, client)).toEqual({ deleted: true, stopped: true, revoked: true });
    expect(reads).toBe(3);
    expect(db.failNext.mailbox_connections).toBeUndefined();
    db.client.from = realFrom;
  });

  it("deletes the row even when the provider is down", async () => {
    const conn = { ...(await connect()), watch_expires_at: "2026-11-20T00:00:00Z" };
    fakeProvider.refreshAccessToken.mockRejectedValueOnce(new Error("down"));
    fakeProvider.revoke.mockRejectedValueOnce(new Error("down"));
    expect(await disconnectMailbox(conn, client)).toEqual({ deleted: true, stopped: false, revoked: false });
    expect(db.tables.mailbox_connections).toHaveLength(0);
  });

  it("disconnects every mailbox of a user and never throws", async () => {
    await connect("a@gmail.com");
    await connect("b@gmail.com");
    fakeProvider.revoke.mockRejectedValueOnce(new Error("down"));
    expect(await disconnectAllMailboxes(USER, client)).toBe(2);
    expect(fakeProvider.revoke).toHaveBeenCalledTimes(2);
    expect(db.tables.mailbox_connections).toHaveLength(0);

    db.failNext.mailbox_connections = { code: "42P01", message: "relation does not exist" };
    await expect(disconnectAllMailboxes(USER, client)).resolves.toBe(0);
  });

  it("takes and revokes the user's parked grants after their mailboxes, and leaves other users' alone", async () => {
    await connect("a@gmail.com");
    // Parked for the same address the user had connected: revoked once that
    // connection is gone, not kept as "in use".
    await parkGrant(client, { userId: USER, provider: "google", email: "a@gmail.com", refreshToken: "1//parked-a" });
    await parkGrant(client, { userId: USER, provider: "google", email: "c@gmail.com", refreshToken: "1//parked-c" });
    const OTHER = "22222222-2222-4222-8222-222222222222";
    await parkGrant(client, { userId: OTHER, provider: "google", email: "d@gmail.com", refreshToken: "1//other" });

    expect(await disconnectAllMailboxes(USER, client)).toBe(1);
    expect(fakeProvider.revoke.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(["1//parked-a", "1//parked-c", "1//rt"]);
    expect(db.tables.mailbox_oauth_parked.map((r) => r.user_id)).toEqual([OTHER]);
  });

  it("leaves the shared grant alone when another account's connection of the address is only paused", async () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const other = await saveConnection({ userId: OTHER, provider: "google", email: "shared@gmail.com", refreshToken: "1//o" }, client);
    if (!other.ok) throw new Error("not saved");
    db.tables.mailbox_connections.find((r) => r.id === other.conn.id)!.status = "paused";
    const mine = await connect("shared@gmail.com");
    expect(await disconnectMailbox(mine, client)).toMatchObject({ deleted: true, revoked: false });
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
  });

  it("keeps a parked grant whose address another account still has connected", async () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const other = await saveConnection({ userId: OTHER, provider: "google", email: "shared@gmail.com", refreshToken: "1//o" }, client);
    expect(other.ok).toBe(true);
    await parkGrant(client, { userId: USER, provider: "google", email: "shared@gmail.com", refreshToken: "1//parked" });
    await disconnectAllMailboxes(USER, client);
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
    expect(db.tables.mailbox_oauth_parked).toHaveLength(0);
  });

  it("releases mailboxes together and stops waiting after the budget, so account deletion goes on", async () => {
    vi.useFakeTimers();
    try {
      await connect("a@gmail.com");
      await connect("b@gmail.com");
      // A provider that never answers.
      fakeProvider.revoke.mockImplementation(() => new Promise(() => {}));
      const done = disconnectAllMailboxes(USER, client);
      await vi.advanceTimersByTimeAsync(ACCOUNT_DELETE_BUDGET_MS + 1);
      await expect(done).resolves.toBe(2);
      // Both were started at once, not one after the other.
      expect(fakeProvider.revoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
