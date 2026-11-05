import { describe, expect, it } from "vitest";
import {
  hashInviteToken,
  inviteAcceptPath,
  inviteExpiry,
  isInviteExpired,
  isInviteTokenShape,
  mintInviteToken,
} from "@/lib/firm/invites";

describe("invite tokens", () => {
  it("mints a 32-char base64url token and its sha256", () => {
    const { token, hash } = mintInviteToken();
    expect(isInviteTokenShape(token)).toBe(true);
    expect(hash).toBe(hashInviteToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(mintInviteToken().token).not.toBe(token);
  });

  it("rejects other shapes", () => {
    expect(isInviteTokenShape("short")).toBe(false);
    expect(isInviteTokenShape("a".repeat(32) + "!")).toBe(false);
    expect(isInviteTokenShape(null)).toBe(false);
  });

  it("expires 14 days out and checks expiry", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(inviteExpiry(now)).toBe("2026-11-18T10:00:00.000Z");
    expect(isInviteExpired("2026-11-18T10:00:00.000Z", now)).toBe(false);
    expect(isInviteExpired("2026-11-04T09:59:59.000Z", now)).toBe(true);
    expect(isInviteExpired(null, now)).toBe(true);
    expect(isInviteExpired("garbage", now)).toBe(true);
  });

  it("builds the accept path with the token encoded", () => {
    expect(inviteAcceptPath("ab_c-1")).toBe("/app/accountant/accept?token=ab_c-1");
  });
});
