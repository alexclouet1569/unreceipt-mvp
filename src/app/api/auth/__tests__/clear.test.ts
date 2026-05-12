// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cookies: [] as Array<{ name: string; value: string }>,
  cookieStore: {
    getAll: () => mocks.cookies,
  },
  signOut: vi.fn(),
  setAllCapture: vi.fn() as unknown as (
    toSet: Array<{ name: string; value: string; options?: unknown }>
  ) => void,
  capturedSetAll: null as
    | ((toSet: Array<{ name: string; value: string; options?: unknown }>) => void)
    | null,
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mocks.cookieStore),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    cfg: {
      cookies: {
        setAll: (
          toSet: Array<{ name: string; value: string; options?: unknown }>
        ) => void;
      };
    }
  ) => {
    mocks.capturedSetAll = cfg.cookies.setAll;
    return {
      auth: {
        signOut: mocks.signOut,
      },
    };
  },
}));

import { POST } from "@/app/api/auth/clear/route";

const buildRequest = () =>
  new NextRequest("http://localhost:3000/api/auth/clear", { method: "POST" });

describe("POST /api/auth/clear", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.cookies.length = 0;
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.capturedSetAll = null;
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("returns 500 when Supabase env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("clears every sb-* cookie on the response with maxAge: 0", async () => {
    mocks.cookies.push({ name: "sb-access-token", value: "stale.jwt" });
    mocks.cookies.push({ name: "sb-refresh-token", value: "stale.refresh" });
    mocks.cookies.push({ name: "sb-proj-auth-token.0", value: "chunk-0" });
    mocks.cookies.push({ name: "sb-proj-auth-token.1", value: "chunk-1" });
    mocks.cookies.push({ name: "next-locale", value: "sv" });

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);

    for (const name of [
      "sb-access-token",
      "sb-refresh-token",
      "sb-proj-auth-token.0",
      "sb-proj-auth-token.1",
    ]) {
      const cleared = res.cookies.get(name);
      expect(cleared, `expected ${name} to be cleared on the response`).toBeDefined();
      expect(cleared!.value).toBe("");
      expect(cleared!.maxAge).toBe(0);
    }

    // Untouched non-sb cookies must NOT be cleared — we're scoped to Supabase.
    expect(res.cookies.get("next-locale")).toBeUndefined();
  });

  it("returns 200 even when signOut throws (already-invalid session)", async () => {
    mocks.cookies.push({ name: "sb-access-token", value: "stale.jwt" });
    mocks.signOut.mockRejectedValue(new Error("supabase down"));

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(res.cookies.get("sb-access-token")?.maxAge).toBe(0);
  });

  it("propagates clearing cookies that supabase.signOut writes via setAll", async () => {
    // signOut() doesn't actually write here, but the route plumbs setAll →
    // response.cookies. Drive the captured setAll directly to prove the wire.
    mocks.signOut.mockImplementation(async () => {
      mocks.capturedSetAll?.([
        {
          name: "sb-supabase-auth-token",
          value: "",
          options: { maxAge: 0, path: "/" },
        },
      ]);
      return { error: null };
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    const cleared = res.cookies.get("sb-supabase-auth-token");
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });
});
