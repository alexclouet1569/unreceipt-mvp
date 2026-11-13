// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bindingCookieName,
  bindingMatches,
  createPending,
  deleteExpiredPending,
  maskAddress,
  newPkce,
  providerErrorReason,
  resultUrl,
  sha256Hex,
  takePending,
} from "../oauth";
import { createFakeDb } from "./fake-db";

const USER = "11111111-1111-4111-8111-111111111111";
const asClient = (db: ReturnType<typeof createFakeDb>) => db.client as unknown as SupabaseClient;

describe("OAuth helpers", () => {
  it("builds an S256 PKCE pair", () => {
    const { verifier, challenge } = newPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("matches the binding cookie against its stored hash only", () => {
    expect(bindingMatches("cookie-value", sha256Hex("cookie-value"))).toBe(true);
    expect(bindingMatches("other", sha256Hex("cookie-value"))).toBe(false);
    expect(bindingMatches(undefined, sha256Hex("cookie-value"))).toBe(false);
    expect(bindingMatches("cookie-value", "not-a-hash")).toBe(false);
    expect(bindingCookieName("state-a")).not.toBe(bindingCookieName("state-b"));
    expect(bindingCookieName("state-a")).toMatch(/^mbx_[0-9a-f]{16}$/);
  });

  it("ends on fixed pages only", () => {
    expect(resultUrl("web", { status: "connected" })).toBe("https://app.unreceipt.com/app/settings?mailbox=connected");
    expect(resultUrl("web", { status: "error", reason: "denied" })).toBe(
      "https://app.unreceipt.com/app/settings?mailbox=error&reason=denied",
    );
    expect(resultUrl("app", { status: "error", reason: "limit" })).toBe("unreceipt://mailboxes?status=error&reason=limit");
    expect(resultUrl("app", { status: "connected" })).toBe("unreceipt://mailboxes?status=connected");
  });

  it("names the provider's refusals", () => {
    expect(providerErrorReason("access_denied", null)).toBe("denied");
    expect(providerErrorReason("access_denied", "AADSTS65001: The user or administrator has not consented")).toBe("admin_consent");
    expect(providerErrorReason("access_denied", "AADSTS90094: Admin consent is required")).toBe("admin_consent");
    expect(providerErrorReason("consent_required", null)).toBe("admin_consent");
    expect(providerErrorReason("server_error", null)).toBe("provider_unavailable");
  });

  it("masks the account address", () => {
    expect(maskAddress("anna@acme.se")).toBe("a•••@acme.se");
    expect(maskAddress(null)).toBe("your account");
  });
});

describe("pending flows", () => {
  it("stores the binding hash, never the cookie, and is taken once", async () => {
    const db = createFakeDb();
    const created = await createPending(asClient(db), { userId: USER, provider: "google", client: "web" });
    if (!created.ok) throw new Error("not created");
    const row = db.tables.mailbox_oauth_pending[0];
    expect(row.browser_binding).toBe(sha256Hex(created.pending.bindingValue));
    expect(JSON.stringify(row)).not.toContain(created.pending.bindingValue);
    expect(row.code_verifier).toBe(created.pending.verifier);

    const first = await takePending(asClient(db), created.pending.state);
    expect(first).toMatchObject({ ok: true, row: { user_id: USER, client: "web" } });
    expect(await takePending(asClient(db), created.pending.state)).toEqual({ ok: true, row: null });
    expect(await takePending(asClient(db), "short")).toEqual({ ok: true, row: null });
  });

  it("lets an app link start one flow", async () => {
    const db = createFakeDb();
    const input = { userId: USER, provider: "google" as const, client: "app" as const, linkJti: "jti-0123456789abcdef" };
    expect((await createPending(asClient(db), input)).ok).toBe(true);
    expect(await createPending(asClient(db), input)).toEqual({ ok: false, error: "link_used" });
  });

  it("deletes expired flows", async () => {
    const db = createFakeDb();
    const now = Date.parse("2026-11-13T10:00:00Z");
    await createPending(asClient(db), { userId: USER, provider: "google", client: "web" }, now - 3600_000);
    await createPending(asClient(db), { userId: USER, provider: "google", client: "web" }, now);
    expect(await deleteExpiredPending(asClient(db), now)).toBe(1);
    expect(db.tables.mailbox_oauth_pending).toHaveLength(1);
  });
});
