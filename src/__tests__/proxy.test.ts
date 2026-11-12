import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type CookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    toSet: { name: string; value: string; options: Record<string, unknown> }[],
    headers: Record<string, string>
  ) => void;
};

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  // The cookie methods the proxy handed to the last Supabase client, so a
  // test can play the SDK rotating the session inside getUser().
  cookies: null as CookieMethods | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: CookieMethods }) => {
    mocks.cookies = opts.cookies;
    return { auth: { getUser: mocks.getUser } };
  },
}));

vi.mock("@/lib/auth-admin", () => ({
  isAdminEmail: (email: string | null | undefined) =>
    email === "founder@unreceipt.com",
}));

import { proxy } from "../../proxy";

const buildRequest = (url: string, host: string) => {
  const req = new NextRequest(url);
  // NextRequest derives host from the URL; override the header anyway
  // so the proxy reads what we actually want to test.
  req.headers.set("host", host);
  return req;
};

describe("proxy — host-based routing", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.getUser.mockReset();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("redirects /app from apex → app subdomain (308)", async () => {
    const res = await proxy(
      buildRequest("https://unreceipt.com/app/login", "unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://app.unreceipt.com/app/login"
    );
  });

  it("redirects /api/webhooks from apex → app subdomain (308 preserves POST)", async () => {
    const res = await proxy(
      buildRequest(
        "https://unreceipt.com/api/webhooks/stripe",
        "unreceipt.com"
      )
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://app.unreceipt.com/api/webhooks/stripe"
    );
  });

  it("redirects /subscribe from apex → app subdomain", async () => {
    const res = await proxy(
      buildRequest("https://unreceipt.com/subscribe?canceled=1", "unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://app.unreceipt.com/subscribe?canceled=1"
    );
  });

  it("redirects /firm and /api/firm from apex → app subdomain", async () => {
    const page = await proxy(
      buildRequest("https://unreceipt.com/firm/clients?month=2026-11", "unreceipt.com")
    );
    expect(page.status).toBe(308);
    expect(page.headers.get("location")).toBe(
      "https://app.unreceipt.com/firm/clients?month=2026-11"
    );
    const api = await proxy(
      buildRequest("https://unreceipt.com/api/firm/clients", "unreceipt.com")
    );
    expect(api.status).toBe(308);
    expect(api.headers.get("location")).toBe(
      "https://app.unreceipt.com/api/firm/clients"
    );
  });

  it("redirects the public demo from apex → app subdomain", async () => {
    const res = await proxy(
      buildRequest("https://unreceipt.com/demo/company?step=2", "unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.unreceipt.com/demo/company?step=2");
  });

  it("redirects / from app subdomain → apex", async () => {
    const res = await proxy(
      buildRequest("https://app.unreceipt.com/", "app.unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://unreceipt.com/");
  });

  it("redirects /privacy from app subdomain → apex", async () => {
    const res = await proxy(
      buildRequest("https://app.unreceipt.com/privacy", "app.unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://unreceipt.com/privacy");
  });

  it("redirects the Swedish landing /sv from app subdomain → apex", async () => {
    const res = await proxy(
      buildRequest("https://app.unreceipt.com/sv", "app.unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://unreceipt.com/sv");
  });

  it("redirects the French landing /fr from app subdomain → apex", async () => {
    const res = await proxy(
      buildRequest("https://app.unreceipt.com/fr", "app.unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://unreceipt.com/fr");
  });

  it("redirects /api/waitlist from app subdomain → apex", async () => {
    const res = await proxy(
      buildRequest(
        "https://app.unreceipt.com/api/waitlist",
        "app.unreceipt.com"
      )
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://unreceipt.com/api/waitlist"
    );
  });

  it("does NOT redirect / on apex (right host)", async () => {
    const res = await proxy(
      buildRequest("https://unreceipt.com/", "unreceipt.com")
    );
    expect(res.status).not.toBe(308);
  });

  it("does NOT redirect /app on app subdomain (right host)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(
      buildRequest("https://app.unreceipt.com/app", "app.unreceipt.com")
    );
    // /app isn't gated by the admin check, so we just pass through.
    expect(res.status).not.toBe(308);
  });

  it("treats localhost as same-origin: no host redirects in dev", async () => {
    const res = await proxy(
      buildRequest("http://localhost:3000/app", "localhost:3000")
    );
    expect(res.status).not.toBe(308);
  });

  it("treats Vercel preview hostnames as same-origin: no host redirects", async () => {
    const res = await proxy(
      buildRequest(
        "https://unreceipt-mvp-abc123.vercel.app/app/login",
        "unreceipt-mvp-abc123.vercel.app"
      )
    );
    expect(res.status).not.toBe(308);
  });

  it("does NOT touch _next/static assets even with broad matcher", async () => {
    const res = await proxy(
      buildRequest(
        "https://unreceipt.com/_next/static/chunks/main.js",
        "unreceipt.com"
      )
    );
    // No redirect, no admin gate.
    expect(res.status).not.toBe(308);
    expect(res.status).not.toBe(403);
  });

  it("ignores image asset requests", async () => {
    const res = await proxy(
      buildRequest(
        "https://app.unreceipt.com/icons/icon-192.png",
        "app.unreceipt.com"
      )
    );
    expect(res.status).not.toBe(308);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe("proxy — admin gate (preserved from PR #13)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.getUser.mockReset();
  });

  it("redirects /admin to /app for non-admin users", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "rando@example.com" } },
    });
    const res = await proxy(
      buildRequest(
        "https://app.unreceipt.com/admin/customers",
        "app.unreceipt.com"
      )
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/app");
  });

  it("returns 403 JSON for non-admin /api/admin calls", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "rando@example.com" } },
    });
    const res = await proxy(
      buildRequest(
        "https://app.unreceipt.com/api/admin/receipts",
        "app.unreceipt.com"
      )
    );
    expect(res.status).toBe(403);
  });

  it("lets admin emails through to /admin", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "founder@unreceipt.com" } },
    });
    const res = await proxy(
      buildRequest(
        "https://app.unreceipt.com/admin/customers",
        "app.unreceipt.com"
      )
    );
    expect(res.status).not.toBe(307);
    expect(res.status).not.toBe(403);
  });
});

describe("proxy — session refresh", () => {
  const NO_CACHE = {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.getUser.mockReset();
    mocks.cookies = null;
  });

  // getUser() that rotates the session the way @supabase/ssr does.
  const rotateOnGetUser = (email = "anna@example.se") =>
    mocks.getUser.mockImplementation(async () => {
      mocks.cookies!.setAll(
        [
          { name: "sb-test-auth-token", value: "new-session", options: { path: "/", maxAge: 400 } },
          { name: "sb-test-auth-token.1", value: "", options: { path: "/", maxAge: 0 } },
        ],
        NO_CACHE
      );
      return { data: { user: { email } } };
    });

  const withSession = (url: string, host: string) => {
    const req = buildRequest(url, host);
    req.cookies.set("sb-test-auth-token", "old-session");
    req.cookies.set("sb-test-auth-token.1", "old-chunk");
    return req;
  };

  it("forwards the rotated cookies upstream on the request, and sets them on the response", async () => {
    rotateOnGetUser();
    const req = withSession("https://app.unreceipt.com/app", "app.unreceipt.com");
    const res = await proxy(req);

    // The request the page sees carries the new session, not the used-up one.
    expect(req.cookies.get("sb-test-auth-token")?.value).toBe("new-session");
    expect(req.cookies.has("sb-test-auth-token.1")).toBe(false);
    expect(res.headers.get("x-middleware-override-headers")).toContain("cookie");
    expect(res.headers.get("x-middleware-request-cookie")).toContain("sb-test-auth-token=new-session");
    expect(res.headers.get("x-middleware-request-cookie")).not.toContain("old-session");

    // The browser gets the same cookies, and no CDN may cache this response.
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("new-session");
    expect(res.headers.get("cache-control")).toBe(NO_CACHE["Cache-Control"]);
  });

  it("forwards no request headers when nothing was rotated", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(withSession("https://app.unreceipt.com/app", "app.unreceipt.com"));
    expect(res.headers.get("x-middleware-override-headers")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("keeps the rotated cookies on a cross-host redirect", async () => {
    rotateOnGetUser();
    const res = await proxy(withSession("https://unreceipt.com/subscribe", "unreceipt.com"));
    expect(res.status).toBe(308);
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("new-session");
  });

  it("does the same for an admin passing the gate", async () => {
    rotateOnGetUser("founder@unreceipt.com");
    const req = withSession("https://app.unreceipt.com/admin/pilot", "app.unreceipt.com");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalledTimes(1); // one rotation per request
    expect(req.cookies.get("sb-test-auth-token")?.value).toBe("new-session");
    expect(res.headers.get("x-middleware-request-cookie")).toContain("sb-test-auth-token=new-session");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("new-session");
  });

  it("still serves the page when the refresh throws", async () => {
    mocks.getUser.mockRejectedValue(new Error("supabase down"));
    const res = await proxy(withSession("https://app.unreceipt.com/app", "app.unreceipt.com"));
    expect(res.status).toBe(200);
  });
});

describe("proxy — billing routes stay on the product host", () => {
  it("redirects /api/billing from apex → app subdomain", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(
      buildRequest("https://unreceipt.com/api/billing/portal", "unreceipt.com")
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.unreceipt.com/api/billing/portal");
  });
});
