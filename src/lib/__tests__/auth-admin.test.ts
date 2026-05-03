import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdminEmail } from "@/lib/auth-admin";

const ENV_KEY = "CONCIERGE_ADMIN_EMAILS";

describe("isAdminEmail", () => {
  const original = process.env[ENV_KEY];

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("returns false when env var is unset (fail-closed)", () => {
    expect(isAdminEmail("anyone@example.com")).toBe(false);
  });

  it("returns false when env var is empty string", () => {
    process.env[ENV_KEY] = "";
    expect(isAdminEmail("anyone@example.com")).toBe(false);
  });

  it("returns false when env var is whitespace-only", () => {
    process.env[ENV_KEY] = "   ";
    expect(isAdminEmail("anyone@example.com")).toBe(false);
  });

  it("returns true for an exact match in the allowlist", () => {
    process.env[ENV_KEY] = "founder@unreceipt.io,alex@example.com";
    expect(isAdminEmail("founder@unreceipt.io")).toBe(true);
  });

  it("returns false for an email not in the allowlist", () => {
    process.env[ENV_KEY] = "founder@unreceipt.io";
    expect(isAdminEmail("intruder@example.com")).toBe(false);
  });

  it("matches case-insensitively when input is uppercased", () => {
    process.env[ENV_KEY] = "founder@unreceipt.io";
    expect(isAdminEmail("Founder@UnReceipt.IO")).toBe(true);
  });

  it("matches case-insensitively when allowlist is uppercased", () => {
    process.env[ENV_KEY] = "FOUNDER@UNRECEIPT.IO";
    expect(isAdminEmail("founder@unreceipt.io")).toBe(true);
  });

  it("tolerates surrounding whitespace in the env value", () => {
    process.env[ENV_KEY] = "  founder@unreceipt.io  ,  alex@example.com  ";
    expect(isAdminEmail("alex@example.com")).toBe(true);
  });

  it("ignores empty entries from a trailing or duplicate comma", () => {
    process.env[ENV_KEY] = "founder@unreceipt.io,,";
    expect(isAdminEmail("founder@unreceipt.io")).toBe(true);
    expect(isAdminEmail("")).toBe(false);
  });

  it("returns false for null input", () => {
    process.env[ENV_KEY] = "founder@unreceipt.io";
    expect(isAdminEmail(null)).toBe(false);
  });

  it("returns false for undefined input", () => {
    process.env[ENV_KEY] = "founder@unreceipt.io";
    expect(isAdminEmail(undefined)).toBe(false);
  });
});
