import { afterEach, describe, expect, it, vi } from "vitest";
import { adminDomainOf, isJoinCodeShape, joinPath, mintJoinCode } from "../join-link";
import { iosAppUrl } from "@/lib/app-url";
import { firmInviteEmail } from "@/lib/email/templates";

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

describe("join codes", () => {
  it("are 128 random bits in the shape the schema checks", () => {
    const a = mintJoinCode();
    const b = mintJoinCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
    expect(isJoinCodeShape(a)).toBe(true);
    for (const bad of ["", "short", `${a}x`, "a".repeat(21) + "/", null, 42]) expect(isJoinCodeShape(bad)).toBe(false);
    expect(joinPath(a)).toBe(`/app/connect/${a}`);
  });
});

describe("adminDomainOf", () => {
  it("names a company domain and flags a personal mailbox", () => {
    expect(adminDomainOf("eva@Bergstrom.se")).toEqual({ domain: "bergstrom.se", personal: false });
    expect(adminDomainOf("eva.berg@gmail.com")).toEqual({ domain: "gmail.com", personal: true });
    expect(adminDomainOf("x@hotmail.se")).toEqual({ domain: "hotmail.se", personal: true });
    expect(adminDomainOf(null)).toBeNull();
    expect(adminDomainOf("not-an-address")).toBeNull();
  });
});

describe("iosAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off until set, and accepts only Apple's own https links", () => {
    vi.stubEnv("NEXT_PUBLIC_IOS_APP_URL", "");
    expect(iosAppUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_IOS_APP_URL", "https://apps.apple.com/app/id123");
    expect(iosAppUrl()).toBe("https://apps.apple.com/app/id123");
    vi.stubEnv("NEXT_PUBLIC_IOS_APP_URL", "https://testflight.apple.com/join/AbC");
    expect(iosAppUrl()).toBe("https://testflight.apple.com/join/AbC");
    for (const bad of ["http://apps.apple.com/x", "https://apps.apple.com.evil.com/x", "https://example.com", "nonsense"]) {
      vi.stubEnv("NEXT_PUBLIC_IOS_APP_URL", bad);
      expect(iosAppUrl()).toBeNull();
    }
  });

  it("adds the app line to the invite email only when there is a link", () => {
    const base = { site: "sv" as const, firmName: "Byrån AB", clientName: "Nordljus AB", url: "https://app.unreceipt.com/app/accountant/accept?token=x" };
    expect(firmInviteEmail(base).text).not.toContain("iPhone");
    const withApp = firmInviteEmail({ ...base, appUrl: "https://apps.apple.com/app/id123" });
    expect(withApp.text).toContain("On iPhone? Get the UnReceipt app");
    expect(withApp.html).toContain('href="https://apps.apple.com/app/id123"');
  });
});
