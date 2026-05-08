import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser },
  }),
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

  it("redirects /demo/* from app subdomain → apex", async () => {
    const res = await proxy(
      buildRequest(
        "https://app.unreceipt.com/demo/employee",
        "app.unreceipt.com"
      )
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://unreceipt.com/demo/employee"
    );
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
