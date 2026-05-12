// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cookies: [] as Array<{ name: string; value: string }>,
  cookieStore: {
    getAll: () => mocks.cookies,
  },
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  syncProfile: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mocks.cookieStore),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      signOut: mocks.signOut,
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock("@/lib/profile-sync", () => ({
  syncProfile: mocks.syncProfile,
}));

import { GET } from "@/app/auth/callback/route";

const buildRequest = (params: Record<string, string> = {}) => {
  const url = new URL("http://localhost:3000/auth/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { method: "GET" });
};

describe("GET /auth/callback", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.cookies.length = 0;
    mocks.exchangeCodeForSession.mockReset();
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.getUser.mockReset();
    mocks.syncProfile.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("redirects to /app/login with error when no code is present", async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/app/login?error=missing_code");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("forwards supabase error params straight to /app/login", async () => {
    const res = await GET(buildRequest({ error: "access_denied" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(
      "/app/login?error=access_denied"
    );
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("clears cookies and bounces to /app/login when exchange fails", async () => {
    // The user-not-found / rotated-JWT case: cookies are present on the
    // request, exchange returns an error, and we expect signOut() to run
    // against the redirect response so its Set-Cookie clearing headers
    // ride along.
    mocks.cookies.push({ name: "sb-access-token", value: "stale.jwt" });
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "User from sub claim in JWT does not exist" },
    });
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(buildRequest({ code: "abc123" }));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/app/login?error=");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.syncProfile).not.toHaveBeenCalled();

    consoleErr.mockRestore();
  });

  it("redirects to next on successful exchange and syncs profile", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-abc",
          user_metadata: { full_name: "Alex", company_name: "Acme" },
        },
      },
    });

    const res = await GET(buildRequest({ code: "abc123" }));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/app");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.syncProfile).toHaveBeenCalledWith("user-abc", {
      full_name: "Alex",
      company_name: "Acme",
    });
  });

  it("ignores attacker-controlled next param outside same-origin paths", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(
      buildRequest({ code: "abc123", next: "https://evil.com/steal" })
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/app");
    expect(res.headers.get("location")).not.toContain("evil.com");
  });
});
