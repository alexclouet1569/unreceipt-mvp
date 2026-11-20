import { describe, expect, it } from "vitest";
import { RESEND_AFTER_S, recentCodeWait } from "../code-send";

describe("recentCodeWait", () => {
  it("reads the seconds left when a code just went to this address", () => {
    // Supabase's wording, from the auth logs (2026-11-19).
    expect(
      recentCodeWait({
        code: "over_email_send_rate_limit",
        message: "For security purposes, you can only request this after 30 seconds.",
      }),
    ).toBe(30);
    expect(recentCodeWait({ message: "For security purposes, you can only request this after 1 second." })).toBe(1);
  });

  it("never waits longer than the resend interval", () => {
    expect(recentCodeWait({ message: "you can only request this after 900 seconds" })).toBe(RESEND_AFTER_S);
  });

  it("is null when nothing was sent (project-wide limit, other errors)", () => {
    expect(recentCodeWait({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" })).toBeNull();
    expect(recentCodeWait({ message: "Network request failed" })).toBeNull();
    expect(recentCodeWait(null)).toBeNull();
  });

  it("matches Supabase's own one-minute interval", () => {
    expect(RESEND_AFTER_S).toBe(60);
  });
});
