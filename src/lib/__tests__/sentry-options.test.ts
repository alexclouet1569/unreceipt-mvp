import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { baseSentryOptions, scrubBreadcrumb, scrubEvent } from "@/lib/sentry-options";

describe("scrubEvent", () => {
  it("strips request bodies, cookies, headers, query strings and user details", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://app.unreceipt.com/app?session_id=cs_live_secret",
        data: { merchant: "ICA", total: 245 },
        cookies: { "sb-auth": "token" },
        headers: { authorization: "Bearer x" },
        query_string: "session_id=cs_live_secret",
      },
      user: { id: "user-1", email: "a@b.se", ip_address: "1.2.3.4" },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.request).toEqual({ url: "https://app.unreceipt.com/app" });
    expect(out.user).toEqual({ id: "user-1" });
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs (they repeat logged errors)", () => {
    expect(scrubBreadcrumb({ category: "console", message: "a@b.se" })).toBeNull();
  });

  it("strips query strings from navigation and fetch URLs", () => {
    expect(
      scrubBreadcrumb({
        category: "navigation",
        data: { from: "/app?session_id=cs_live_x", to: "/auth/callback?code=abc" },
      })?.data
    ).toEqual({ from: "/app", to: "/auth/callback" });
    expect(
      scrubBreadcrumb({ category: "fetch", data: { url: "/api/x?y=1", method: "GET" } })?.data
    ).toEqual({ url: "/api/x", method: "GET" });
  });
});

describe("baseSentryOptions", () => {
  it("sends no performance traces", () => {
    expect(baseSentryOptions.tracesSampleRate).toBe(0);
  });
});
