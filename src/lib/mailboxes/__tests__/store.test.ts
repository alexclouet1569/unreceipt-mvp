// @vitest-environment node

import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("tests pass the fake client explicitly");
  },
}));

import {
  CONNECTION_LIMIT,
  deleteConnection,
  getConnection,
  getDecryptedToken,
  listConnections,
  markNeedsReconnect,
  saveConnection,
  toSummary,
  updateCursor,
} from "../store";
import { createFakeDb } from "./fake-db";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

let db: ReturnType<typeof createFakeDb>;
let client: SupabaseClient;

beforeEach(() => {
  process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
  db = createFakeDb();
  client = db.client as unknown as SupabaseClient;
});

const save = (email: string, userId = USER, refreshToken = "1//rt") =>
  saveConnection({ userId, provider: "google", email, refreshToken }, client);

describe("mailbox store", () => {
  it("stores the token encrypted and gives it back only through getDecryptedToken", async () => {
    const saved = await save("Anna@Gmail.com", USER, "1//plain-refresh");
    if (!saved.ok) throw new Error("not saved");
    expect(saved.created).toBe(true);
    expect(saved.conn.email).toBe("anna@gmail.com");
    expect(saved.conn).not.toHaveProperty("refresh_token_enc");
    const stored = db.tables.mailbox_connections[0].refresh_token_enc as string;
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("plain-refresh");
    expect(await getDecryptedToken(saved.conn, client)).toBe("1//plain-refresh");
  });

  it("never lists the token or leaks it in a summary", async () => {
    await save("a@gmail.com");
    await save("b@gmail.com", OTHER);
    const list = await listConnections(USER, client);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("refresh_token_enc");
    const summary = toSummary(list[0]);
    expect(Object.keys(summary).sort()).toEqual(
      ["createdAt", "email", "id", "lastReceiptAt", "lastSyncAt", "provider", "status"].sort(),
    );
    expect(await getConnection(list[0].id, { userId: OTHER, supabase: client })).toBeNull();
  });

  it("re-connecting an address replaces the token and makes it active again", async () => {
    const first = await save("anna@gmail.com", USER, "1//old");
    if (!first.ok) throw new Error();
    await markNeedsReconnect(first.conn.id, "reauth_required", client);
    expect(db.tables.mailbox_connections[0]).toMatchObject({ status: "needs_reconnect", last_error: "reauth_required" });

    const again = await save("ANNA@gmail.com", USER, "1//new");
    if (!again.ok) throw new Error();
    expect(again.created).toBe(false);
    expect(again.conn.id).toBe(first.conn.id);
    expect(db.tables.mailbox_connections).toHaveLength(1);
    expect(db.tables.mailbox_connections[0]).toMatchObject({ status: "active", last_error: null });
    expect(await getDecryptedToken(again.conn, client)).toBe("1//new");
  });

  it("refuses a 6th mailbox but still lets a known one reconnect", async () => {
    for (let i = 0; i < CONNECTION_LIMIT; i++) expect((await save(`m${i}@gmail.com`)).ok).toBe(true);
    expect(await save("sixth@gmail.com")).toEqual({ ok: false, error: "limit" });
    expect((await save("m0@gmail.com")).ok).toBe(true);
    // Another user's mailboxes don't count, and the same address is allowed for them.
    expect((await save("m0@gmail.com", OTHER)).ok).toBe(true);
  });

  it("refuses an address that isn't one", async () => {
    expect(await save("not an address")).toEqual({ ok: false, error: "invalid_email" });
  });

  it("moves the cursor by compare-and-set only (null-safe)", async () => {
    const saved = await save("anna@gmail.com");
    if (!saved.ok) throw new Error();
    const id = saved.conn.id;
    expect(await updateCursor(id, null, "100", { lastReceiptAt: "2026-11-13T10:00:00Z" }, client)).toBe(true);
    expect(db.tables.mailbox_connections[0]).toMatchObject({ cursor: "100", last_receipt_at: "2026-11-13T10:00:00Z" });
    // A second sync that also started from null loses.
    expect(await updateCursor(id, null, "101", {}, client)).toBe(false);
    // So does one from a stale cursor.
    expect(await updateCursor(id, "99", "102", {}, client)).toBe(false);
    expect(db.tables.mailbox_connections[0].cursor).toBe("100");
    expect(await updateCursor(id, "100", "103", {}, client)).toBe(true);
    expect(db.tables.mailbox_connections[0].cursor).toBe("103");
  });

  it("deletes only the owner's row", async () => {
    const saved = await save("anna@gmail.com");
    if (!saved.ok) throw new Error();
    expect(await deleteConnection(saved.conn.id, OTHER, client)).toBe(false);
    expect(db.tables.mailbox_connections).toHaveLength(1);
    expect(await deleteConnection(saved.conn.id, USER, client)).toBe(true);
    expect(db.tables.mailbox_connections).toHaveLength(0);
  });

  it("can't read a token moved onto another user's row", async () => {
    const saved = await save("anna@gmail.com");
    if (!saved.ok) throw new Error();
    db.tables.mailbox_connections[0].user_id = OTHER;
    await expect(getDecryptedToken({ ...saved.conn, user_id: OTHER }, client)).rejects.toThrow();
  });
});
