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
vi.mock("@/lib/mailboxes/google", async () => ({
  googleProvider: (await import("./fake-provider")).fakeProvider,
}));

import { fakeProvider, resetFakeProvider } from "./fake-provider";
import { createFakeDb } from "./fake-db";
import { forgetAccessToken, getAccessToken } from "../access-token";
import { saveConnection } from "../store";
import { syncConnection } from "../sync";
import { disconnectAllMailboxes, disconnectMailbox } from "../teardown";
import { ReauthRequiredError, MailboxProviderError, type MailboxConnectionRef } from "../types";
import { decryptToken } from "../crypto";

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
});
