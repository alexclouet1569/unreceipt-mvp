import { describe, expect, it } from "vitest";
import {
  attributionFrom,
  formatSignupSource,
  sanitizeSignupSource,
  withAttribution,
} from "@/lib/attribution";

describe("sanitizeSignupSource", () => {
  it("keeps the allow-listed keys and drops everything else", () => {
    expect(
      sanitizeSignupSource({
        utm_source: "linkedin",
        utm_medium: "social",
        utm_campaign: "outreach",
        ref: "www.LinkedIn.com",
        landing: "/sv/redovisningsbyra",
        email: "someone@example.com",
        next: "/firm",
      })
    ).toEqual({
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "outreach",
      ref: "linkedin.com",
      landing: "/sv/redovisningsbyra",
    });
  });

  it("returns null when nothing valid is left", () => {
    expect(sanitizeSignupSource({})).toBeNull();
    expect(sanitizeSignupSource(null)).toBeNull();
    expect(sanitizeSignupSource({ utm_source: "   ", landing: "sv" })).toBeNull();
  });

  it("bounds tag length and characters", () => {
    expect(sanitizeSignupSource({ utm_source: "a".repeat(101) })).toBeNull();
    expect(sanitizeSignupSource({ utm_source: "a".repeat(100) })).toEqual({ utm_source: "a".repeat(100) });
    expect(sanitizeSignupSource({ utm_source: "<script>alert(1)</script>" })).toBeNull();
    expect(sanitizeSignupSource({ utm_campaign: "vår kampanj 2026" })).toEqual({ utm_campaign: "vår kampanj 2026" });
    expect(sanitizeSignupSource({ utm_source: 42 })).toBeNull();
  });

  it("accepts only a hostname as referrer, never ours", () => {
    expect(sanitizeSignupSource({ ref: "https://evil.com/x" })).toBeNull();
    expect(sanitizeSignupSource({ ref: "unreceipt.com" })).toBeNull();
    expect(sanitizeSignupSource({ ref: "app.unreceipt.com" })).toBeNull();
    expect(sanitizeSignupSource({ ref: "google.se" })).toEqual({ ref: "google.se" });
  });

  it("accepts only a plain path as landing page", () => {
    expect(sanitizeSignupSource({ landing: "/sv" })).toEqual({ landing: "/sv" });
    expect(sanitizeSignupSource({ landing: "/" })).toEqual({ landing: "/" });
    expect(sanitizeSignupSource({ landing: "/sv?x=1" })).toBeNull();
    expect(sanitizeSignupSource({ landing: "//evil.com" })).toBeNull();
    expect(sanitizeSignupSource({ landing: "/" + "a".repeat(200) })).toBeNull();
  });

  it("reads URLSearchParams and ignores repeated keys from Next's searchParams", () => {
    expect(sanitizeSignupSource(new URLSearchParams("utm_source=test&landing=%2Fsv"))).toEqual({
      utm_source: "test",
      landing: "/sv",
    });
    expect(sanitizeSignupSource({ utm_source: ["a", "b"], utm_campaign: "x" })).toEqual({ utm_campaign: "x" });
  });
});

describe("attributionFrom", () => {
  it("reads the campaign tags and the page from a Swedish landing page", () => {
    expect(attributionFrom("https://unreceipt.com/sv?utm_source=test&utm_campaign=x", "")).toEqual({
      utm_source: "test",
      utm_campaign: "x",
      landing: "/sv",
    });
  });

  it("keeps an outside referrer and drops our own hosts", () => {
    expect(attributionFrom("https://unreceipt.com/", "https://www.linkedin.com/feed/")).toEqual({
      ref: "linkedin.com",
      landing: "/",
    });
    expect(attributionFrom("https://unreceipt.com/sv", "https://unreceipt.com/")).toEqual({ landing: "/sv" });
    expect(attributionFrom("https://app.unreceipt.com/demo", "https://unreceipt.com/sv")).toEqual({
      landing: "/demo",
    });
  });

  it("keeps the source a demo tour URL carried from the marketing site", () => {
    expect(
      attributionFrom(
        "https://app.unreceipt.com/demo/company?step=1&utm_source=linkedin&ref=linkedin.com&landing=%2Fsv",
        "https://unreceipt.com/"
      )
    ).toEqual({ utm_source: "linkedin", ref: "linkedin.com", landing: "/sv" });
  });

  it("returns null for an unreadable URL", () => {
    expect(attributionFrom("not a url", "")).toBeNull();
  });
});

describe("withAttribution", () => {
  it("adds the source to an absolute sign-up link and keeps mode=signup", () => {
    const href = withAttribution("https://app.unreceipt.com/app/login?mode=signup", {
      utm_source: "test",
      utm_campaign: "x",
      landing: "/sv",
    });
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://app.unreceipt.com/app/login");
    expect(url.searchParams.get("mode")).toBe("signup");
    expect(url.searchParams.get("utm_source")).toBe("test");
    expect(url.searchParams.get("utm_campaign")).toBe("x");
    expect(url.searchParams.get("landing")).toBe("/sv");
  });

  it("keeps a relative link relative", () => {
    expect(withAttribution("/app/login?mode=signup", { utm_source: "test" })).toBe(
      "/app/login?mode=signup&utm_source=test"
    );
    expect(withAttribution("/demo/company?step=1", { landing: "/sv" })).toBe("/demo/company?step=1&landing=%2Fsv");
  });

  it("leaves the link alone without a source", () => {
    expect(withAttribution("/app/login?mode=signup", null)).toBe("/app/login?mode=signup");
  });

  it("is idempotent: a second click doesn't repeat the params", () => {
    const once = withAttribution("/app/login?mode=signup", { utm_source: "test" });
    expect(withAttribution(once, { utm_source: "test" })).toBe(once);
  });
});

describe("formatSignupSource", () => {
  it("shows source / campaign / landing page", () => {
    expect(formatSignupSource({ utm_source: "test", utm_campaign: "x", landing: "/sv" })).toBe("test / x / /sv");
  });

  it("adds the medium and the referring site", () => {
    expect(
      formatSignupSource({
        utm_source: "linkedin",
        utm_medium: "social",
        utm_campaign: "outreach",
        ref: "linkedin.com",
        landing: "/sv",
      })
    ).toBe("linkedin (social) / outreach / /sv · from linkedin.com");
  });

  it("uses the referrer, else 'direct', when there is no campaign tag", () => {
    expect(formatSignupSource({ ref: "google.se", landing: "/sv" })).toBe("google.se / — / /sv");
    expect(formatSignupSource({ landing: "/" })).toBe("direct / — / /");
    expect(formatSignupSource(null)).toBeNull();
  });
});
