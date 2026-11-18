import { describe, expect, it } from "vitest";
import { scrubAnalyticsEvent, scrubAnalyticsUrl, scrubPath } from "@/lib/tracking/scrub";

describe("scrubAnalyticsUrl", () => {
  it("drops the query and hash on the product host", () => {
    expect(scrubAnalyticsUrl("https://app.unreceipt.com/app/accountant/accept?token=abc123#x")).toBe(
      "https://app.unreceipt.com/app/accountant/accept"
    );
    expect(scrubAnalyticsUrl("https://app.unreceipt.com/app#access_token=eyJ&refresh_token=r")).toBe(
      "https://app.unreceipt.com/app"
    );
    expect(scrubAnalyticsUrl("https://app.unreceipt.com/app/login?mode=signup&utm_source=x")).toBe(
      "https://app.unreceipt.com/app/login"
    );
  });

  it("replaces a firm's join code in the path", () => {
    expect(scrubAnalyticsUrl("https://app.unreceipt.com/app/connect/Zx81kQ_secret?x=1")).toBe(
      "https://app.unreceipt.com/app/connect/[code]"
    );
  });

  it("drops the query on previews and localhost too", () => {
    expect(scrubAnalyticsUrl("https://unreceipt-git-x.vercel.app/app/firm-request?token=t")).toBe(
      "https://unreceipt-git-x.vercel.app/app/firm-request"
    );
    expect(scrubAnalyticsUrl("http://localhost:3000/sv?utm_source=a")).toBe("http://localhost:3000/sv");
  });

  it("keeps the campaign tags only on the marketing site", () => {
    expect(scrubAnalyticsUrl("https://unreceipt.com/sv?utm_source=test&utm_campaign=x&email=a%40b.se#faq")).toBe(
      "https://unreceipt.com/sv?utm_source=test&utm_campaign=x"
    );
    expect(scrubAnalyticsUrl("https://unreceipt.com/")).toBe("https://unreceipt.com/");
  });

  it("returns null for an unreadable URL", () => {
    expect(scrubAnalyticsUrl("::")).toBeNull();
  });
});

describe("scrubPath", () => {
  it("replaces identifiers in admin and firm paths", () => {
    expect(scrubPath("/admin/11111111-1111-4111-8111-111111111111")).toBe("/admin/[userId]");
    expect(scrubPath("/admin/pilot")).toBe("/admin/pilot");
    expect(scrubPath("/admin")).toBe("/admin");
    expect(scrubPath("/firm/clients/22222222-2222-4222-8222-222222222222")).toBe("/firm/clients/[orgId]");
    expect(scrubPath("/firm/clients")).toBe("/firm/clients");
  });
});

describe("scrubAnalyticsEvent", () => {
  it("keeps the event and swaps the URL", () => {
    expect(scrubAnalyticsEvent({ type: "pageview", url: "https://app.unreceipt.com/app?token=x" })).toEqual({
      type: "pageview",
      url: "https://app.unreceipt.com/app",
    });
    expect(scrubAnalyticsEvent({ type: "vital", url: "https://app.unreceipt.com/app/connect/abc", route: "/app/connect/[code]" })).toEqual({
      type: "vital",
      url: "https://app.unreceipt.com/app/connect/[code]",
      route: "/app/connect/[code]",
    });
  });

  it("drops an event whose URL can't be read", () => {
    expect(scrubAnalyticsEvent({ type: "pageview", url: "" })).toBeNull();
  });
});
