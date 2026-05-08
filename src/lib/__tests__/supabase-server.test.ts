import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: [] as Array<{ name: string; value: string }>,
  cookieStore: {
    getAll: () => mocks.cookies,
    set: vi.fn(),
  },
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mocks.cookieStore),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  }),
}));

import { getServerUser } from "@/lib/supabase-server";

const FAKE_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alex@example.se",
} as const;

describe("getServerUser", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.cookies.length = 0;
    mocks.cookieStore.set.mockReset();
    mocks.getUser.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("returns the user when getUser succeeds", async () => {
    mocks.cookies.push({ name: "sb-access-token", value: "valid.jwt" });
    mocks.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });

    const user = await getServerUser();
    expect(user).toEqual(FAKE_USER);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns null and clears cookies when sb-* cookies exist but the user is gone", async () => {
    mocks.cookies.push({ name: "sb-access-token", value: "stale.jwt" });
    mocks.cookies.push({ name: "sb-refresh-token", value: "stale.refresh" });
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "User from sub claim in JWT does not exist" },
    });

    const user = await getServerUser();

    expect(user).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("returns null without calling signOut when no sb-* cookies are present (anonymous request)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const user = await getServerUser();

    expect(user).toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("swallows signOut throws so the caller still gets null cleanly", async () => {
    mocks.cookies.push({ name: "sb-access-token", value: "stale.jwt" });
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "user not found" },
    });
    mocks.signOut.mockRejectedValue(new Error("supabase down"));

    await expect(getServerUser()).resolves.toBeNull();
  });

  it("treats a non-sb cookie as anonymous and skips the clear path", async () => {
    mocks.cookies.push({ name: "next-locale", value: "sv" });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await getServerUser();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
