import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: [] as Array<{ name: string; value: string }>,
  cookieStore: {
    getAll: () => mocks.cookies,
    set: vi.fn(),
  },
  getUser: vi.fn(),
  signOut: vi.fn(),
  authorization: null as string | null,
  bearerGetUser: vi.fn(),
  bearerGetClaims: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(mocks.cookieStore),
  headers: () =>
    Promise.resolve(
      new Headers(mocks.authorization ? { authorization: mocks.authorization } : {})
    ),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    mocks.createClient(...args);
    return { auth: { getUser: mocks.bearerGetUser, getClaims: mocks.bearerGetClaims } };
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  }),
}));

import {
  bearerAccessToken,
  getServerUser,
  getSessionClaims,
  getUserSupabase,
} from "@/lib/supabase-server";

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
    mocks.authorization = null;
    mocks.bearerGetUser.mockReset();
    mocks.bearerGetClaims.mockReset();
    mocks.createClient.mockReset();
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

// The native iPhone app (mobile/) sends its Keychain session as a bearer
// token instead of cookies.
describe("bearer tokens from the native app", () => {
  const TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    mocks.cookies.length = 0;
    mocks.getUser.mockReset();
    mocks.signOut.mockReset();
    mocks.bearerGetUser.mockReset();
    mocks.bearerGetClaims.mockReset();
    mocks.createClient.mockReset();
    mocks.authorization = `Bearer ${TOKEN}`;
  });

  it("reads only a well-formed JWT from the Authorization header", async () => {
    expect(await bearerAccessToken()).toBe(TOKEN);
    mocks.authorization = "Bearer not-a-jwt";
    expect(await bearerAccessToken()).toBeNull();
    mocks.authorization = `Basic ${TOKEN}`;
    expect(await bearerAccessToken()).toBeNull();
    mocks.authorization = `Bearer ${TOKEN}, Bearer ${TOKEN}`;
    expect(await bearerAccessToken()).toBeNull();
    mocks.authorization = null;
    expect(await bearerAccessToken()).toBeNull();
  });

  it("returns the token's user, verified by Supabase Auth", async () => {
    mocks.bearerGetUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });

    expect(await getServerUser()).toEqual(FAKE_USER);
    expect(mocks.bearerGetUser).toHaveBeenCalledWith(TOKEN);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("never falls back to cookies when the token is invalid", async () => {
    mocks.cookies.push({ name: "sb-access-token", value: "valid.jwt" });
    mocks.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
    mocks.bearerGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    expect(await getServerUser()).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("uses the cookies when the header isn't a bearer JWT", async () => {
    mocks.authorization = "Bearer garbage";
    mocks.cookies.push({ name: "sb-access-token", value: "valid.jwt" });
    mocks.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });

    expect(await getServerUser()).toEqual(FAKE_USER);
    expect(mocks.bearerGetUser).not.toHaveBeenCalled();
  });

  it("gives row-level-security queries the caller's token, with nothing persisted", async () => {
    await getUserSupabase();

    const [url, key, options] = mocks.createClient.mock.calls[0] as [
      string,
      string,
      { global: { headers: Record<string, string> }; auth: Record<string, boolean> },
    ];
    expect(url).toBe("https://test.supabase.co");
    expect(key).toBe("test-anon-key");
    expect(options.global.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
  });

  it("reads this session's claims from the token (account deletion's fresh sign-in)", async () => {
    mocks.bearerGetClaims.mockResolvedValue({
      data: { claims: { amr: [{ method: "otp", timestamp: 1 }] } },
      error: null,
    });
    expect(await getSessionClaims()).toEqual({ amr: [{ method: "otp", timestamp: 1 }] });
    expect(mocks.bearerGetClaims).toHaveBeenCalledWith(TOKEN);

    mocks.bearerGetClaims.mockResolvedValue({ data: null, error: { message: "bad" } });
    expect(await getSessionClaims()).toBeNull();
  });
});
