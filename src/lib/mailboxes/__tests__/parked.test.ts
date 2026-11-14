// @vitest-environment node
// The iPhone app's parked grants: stored hashed and encrypted, taken once,
// bound to their user, expired ones revoked by the daily cleanup.

import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeDb } from "./fake-db";

vi.mock("@/lib/mailboxes/google", async () => ({
  googleProvider: (await import("./fake-provider")).fakeProvider,
}));

import { fakeProvider, resetFakeProvider } from "./fake-provider";
import { sha256Hex } from "../oauth";
import {
  CLEANUP_BATCH,
  deleteExpiredParked,
  isClaimCode,
  parkGrant,
  parkedRefreshToken,
  revokeParked,
  takeParked,
} from "../parked";
import { decryptToken } from "../crypto";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const asClient = (db: ReturnType<typeof createFakeDb>) => db.client as unknown as SupabaseClient;
const grant = { userId: USER, provider: "google" as const, email: " Anna@Gmail.com ", refreshToken: "1//secret" };

beforeEach(() => {
  process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
  resetFakeProvider(fakeProvider);
});

describe("parked grants", () => {
  it("stores the code's hash and an encrypted token bound to the user, never either in the clear", async () => {
    const db = createFakeDb();
    const parked = await parkGrant(asClient(db), grant);
    if (!parked.ok) throw new Error("not parked");
    expect(isClaimCode(parked.code)).toBe(true);
    const [row] = db.tables.mailbox_oauth_parked;
    expect(row).toMatchObject({ code_hash: sha256Hex(parked.code), user_id: USER, provider: "google", email: "anna@gmail.com" });
    expect(JSON.stringify(row)).not.toContain(parked.code);
    expect(JSON.stringify(row)).not.toContain("1//secret");
    const stored = { user_id: row.user_id as string, refresh_token_enc: row.refresh_token_enc as string };
    expect(parkedRefreshToken(stored)).toBe("1//secret");
    // Not readable as another user's, nor as a connection row's token.
    expect(() => parkedRefreshToken({ ...stored, user_id: OTHER })).toThrow();
    expect(() => decryptToken(row.refresh_token_enc as string, `user:${USER}`)).toThrow();
  });

  it("refuses an unusable address", async () => {
    const db = createFakeDb();
    expect(await parkGrant(asClient(db), { ...grant, email: "not an address" })).toEqual({ ok: false, error: "invalid_email" });
    expect(db.tables.mailbox_oauth_parked ?? []).toHaveLength(0);
  });

  it("is taken once", async () => {
    const db = createFakeDb();
    const parked = await parkGrant(asClient(db), grant);
    if (!parked.ok) throw new Error("not parked");
    expect(await takeParked(asClient(db), parked.code)).toMatchObject({ ok: true, row: { user_id: USER } });
    expect(await takeParked(asClient(db), parked.code)).toEqual({ ok: true, row: null });
    expect(await takeParked(asClient(db), "short")).toEqual({ ok: true, row: null });
  });

  it("revokes and deletes expired grants only", async () => {
    const db = createFakeDb();
    const now = Date.parse("2026-11-13T10:00:00Z");
    await parkGrant(asClient(db), { ...grant, refreshToken: "1//old" }, now - 3600_000);
    await parkGrant(asClient(db), { ...grant, refreshToken: "1//fresh" }, now);
    expect(await deleteExpiredParked(asClient(db), now)).toBe(1);
    expect(db.tables.mailbox_oauth_parked).toHaveLength(1);
    expect(fakeProvider.revoke).toHaveBeenCalledTimes(1);
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//old");
  });

  it("keeps cleaning when a revoke fails", async () => {
    const db = createFakeDb();
    const now = Date.parse("2026-11-13T10:00:00Z");
    await parkGrant(asClient(db), grant, now - 3600_000);
    await parkGrant(asClient(db), grant, now - 3600_000);
    fakeProvider.revoke.mockRejectedValueOnce(new Error("down"));
    expect(await deleteExpiredParked(asClient(db), now)).toBe(2);
    expect(db.tables.mailbox_oauth_parked).toHaveLength(0);
  });

  it("revokes only the batch it deletes, leaving the rest for the next run", async () => {
    const db = createFakeDb();
    const now = Date.parse("2026-11-13T10:00:00Z");
    for (let i = 0; i < CLEANUP_BATCH + 3; i++) {
      await parkGrant(asClient(db), { ...grant, refreshToken: `1//old-${i}` }, now - 3600_000 - i);
    }
    expect(await deleteExpiredParked(asClient(db), now)).toBe(CLEANUP_BATCH);
    expect(fakeProvider.revoke).toHaveBeenCalledTimes(CLEANUP_BATCH);
    expect(db.tables.mailbox_oauth_parked).toHaveLength(3);
    // Every deleted row was revoked; every row left is still there to revoke.
    const left = db.tables.mailbox_oauth_parked.map((r) => parkedRefreshToken(r as { user_id: string; refresh_token_enc: string }));
    const revoked = fakeProvider.revoke.mock.calls.map((c) => (c as unknown[])[0]);
    expect(left.some((t) => revoked.includes(t))).toBe(false);
    expect(await deleteExpiredParked(asClient(db), now)).toBe(3);
    expect(fakeProvider.revoke).toHaveBeenCalledTimes(CLEANUP_BATCH + 3);
    expect(db.tables.mailbox_oauth_parked).toHaveLength(0);
  });

  it("never revokes a grant whose address someone has connected (the grant is shared at Google)", async () => {
    const db = createFakeDb({
      mailbox_connections: [
        { id: "c-other", user_id: OTHER, provider: "google", email: "anna@gmail.com", status: "active" },
      ],
    });
    const now = Date.parse("2026-11-13T10:00:00Z");
    await parkGrant(asClient(db), grant, now - 3600_000);
    expect(await deleteExpiredParked(asClient(db), now)).toBe(1);
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
    expect(db.tables.mailbox_oauth_parked).toHaveLength(0);

    // A connection that needs reconnecting holds no live grant: revoked.
    db.tables.mailbox_connections[0].status = "needs_reconnect";
    await parkGrant(asClient(db), grant, now - 3600_000);
    expect(await deleteExpiredParked(asClient(db), now)).toBe(1);
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//secret");
  });

  it("keeps the grant when it can't tell whether the address is connected", async () => {
    const db = createFakeDb();
    const parked = await parkGrant(asClient(db), grant);
    if (!parked.ok) throw new Error("not parked");
    const taken = await takeParked(asClient(db), parked.code);
    if (!taken.ok || !taken.row) throw new Error("not taken");
    db.failNext.mailbox_connections = { code: "08006", message: "down" };
    expect(await revokeParked(taken.row, asClient(db))).toBe(false);
    expect(fakeProvider.revoke).not.toHaveBeenCalled();
    expect(await revokeParked(taken.row, asClient(db))).toBe(true);
    expect(fakeProvider.revoke).toHaveBeenCalledWith("1//secret");
  });
});
