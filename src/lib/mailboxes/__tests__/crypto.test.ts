// @vitest-environment node

import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MailboxCryptoError, decryptToken, encryptToken, tokenKeyConfigured } from "../crypto";

const KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.MAILBOX_TOKEN_KEY = KEY;
});
afterEach(() => {
  delete process.env.MAILBOX_TOKEN_KEY;
});

const flip = (part: string) => {
  const bytes = Buffer.from(part, "base64url");
  bytes[0] ^= 0x01;
  return bytes.toString("base64url");
};

describe("mailbox token crypto", () => {
  it("round-trips, in the v1 format, with a fresh IV every time", () => {
    const a = encryptToken("1//refresh-token", "user:u1");
    const b = encryptToken("1//refresh-token", "user:u1");
    expect(a).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh-token");
    expect(decryptToken(a, "user:u1")).toBe("1//refresh-token");
    expect(decryptToken(b, "user:u1")).toBe("1//refresh-token");
  });

  it("throws when any part is changed", () => {
    const blob = encryptToken("secret", "user:u1");
    const parts = blob.split(".");
    for (const i of [1, 2, 3]) {
      const tampered = [...parts];
      tampered[i] = flip(tampered[i]);
      expect(() => decryptToken(tampered.join("."), "user:u1")).toThrow(MailboxCryptoError);
    }
    expect(() => decryptToken(blob.replace(/^v1/, "v2"), "user:u1")).toThrow(MailboxCryptoError);
    expect(() => decryptToken("v1.a.b", "user:u1")).toThrow(MailboxCryptoError);
    expect(() => decryptToken("not a token", "user:u1")).toThrow(MailboxCryptoError);
  });

  it("is bound to its context: another user's row can't use it", () => {
    const blob = encryptToken("secret", "user:u1");
    expect(() => decryptToken(blob, "user:u2")).toThrow(MailboxCryptoError);
  });

  it("refuses to decrypt with another key", () => {
    const blob = encryptToken("secret", "user:u1");
    process.env.MAILBOX_TOKEN_KEY = randomBytes(32).toString("base64");
    expect(() => decryptToken(blob, "user:u1")).toThrow(/failed authentication/);
  });

  it("explains a missing or wrong-length key", () => {
    delete process.env.MAILBOX_TOKEN_KEY;
    expect(() => encryptToken("secret", "user:u1")).toThrow(/MAILBOX_TOKEN_KEY is not set/);
    expect(tokenKeyConfigured()).toBe(false);
    process.env.MAILBOX_TOKEN_KEY = randomBytes(16).toString("base64");
    expect(() => encryptToken("secret", "user:u1")).toThrow(/32 bytes/);
    process.env.MAILBOX_TOKEN_KEY = "not base64 at all!";
    expect(() => encryptToken("secret", "user:u1")).toThrow(/base64/);
    process.env.MAILBOX_TOKEN_KEY = KEY;
    expect(tokenKeyConfigured()).toBe(true);
  });
});
