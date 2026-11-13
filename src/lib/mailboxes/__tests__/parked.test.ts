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
import { deleteExpiredParked, isClaimCode, parkGrant, parkedRefreshToken, takeParked } from "../parked";
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
});
