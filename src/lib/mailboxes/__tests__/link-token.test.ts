// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LINK_TTL_SECONDS, linkSecretConfigured, signConnectLink, verifyConnectLink } from "../link-token";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-11-13T10:00:00Z");

beforeEach(() => {
  process.env.MAILBOX_STATE_SECRET = "a-test-secret-that-is-long-enough-1234567890";
});
afterEach(() => {
  delete process.env.MAILBOX_STATE_SECRET;
});

describe("connect link tokens", () => {
  it("verifies for its user and provider until it expires", () => {
    const { token, jti, expiresAt } = signConnectLink({ userId: USER, provider: "google" }, NOW);
    expect(expiresAt).toBe(NOW + LINK_TTL_SECONDS * 1000);
    expect(verifyConnectLink(token, "google", NOW + 1000)).toEqual({
      ok: true,
      userId: USER,
      provider: "google",
      jti,
      expiresAt,
    });
    expect(verifyConnectLink(token, "google", expiresAt)).toEqual({ ok: false, reason: "expired" });
  });

  it("gives every link its own jti", () => {
    const a = signConnectLink({ userId: USER, provider: "google" }, NOW);
    const b = signConnectLink({ userId: USER, provider: "google" }, NOW);
    expect(a.jti).not.toBe(b.jti);
    expect(a.token).not.toBe(b.token);
  });

  it("refuses another provider", () => {
    const { token } = signConnectLink({ userId: USER, provider: "google" }, NOW);
    expect(verifyConnectLink(token, "microsoft", NOW)).toEqual({ ok: false, reason: "wrong_provider" });
  });

  it("refuses a payload changed to another user (signature)", () => {
    const { token } = signConnectLink({ userId: USER, provider: "google" }, NOW);
    const [body, mac] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.u = OTHER;
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${mac}`;
    expect(verifyConnectLink(forged, "google", NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a link signed with another secret, and garbage", () => {
    const { token } = signConnectLink({ userId: USER, provider: "google" }, NOW);
    process.env.MAILBOX_STATE_SECRET = "another-secret-that-is-also-long-enough-0987";
    expect(verifyConnectLink(token, "google", NOW)).toEqual({ ok: false, reason: "invalid" });
    for (const bad of [null, "", "abc", "a.b.c", "!!.??", "x".repeat(600)]) {
      expect(verifyConnectLink(bad, "google", NOW)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("needs a secret of 32+ characters", () => {
    process.env.MAILBOX_STATE_SECRET = "short";
    expect(linkSecretConfigured()).toBe(false);
    expect(() => signConnectLink({ userId: USER, provider: "google" }, NOW)).toThrow(/MAILBOX_STATE_SECRET/);
    expect(() => signConnectLink({ userId: "not-a-uuid", provider: "google" }, NOW)).toThrow();
  });
});
