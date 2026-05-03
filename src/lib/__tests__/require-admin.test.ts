import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  cookieStore: {
    getAll: () => [] as Array<{ name: string; value: string }>,
    set: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
  })),
}));

import { AdminAuthError, requireAdmin } from "@/lib/require-admin";

describe("requireAdmin", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalAdmins = process.env.CONCIERGE_ADMIN_EMAILS;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.CONCIERGE_ADMIN_EMAILS = "founder@unreceipt.com";
    mocks.getUser.mockReset();
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    if (originalAdmins === undefined) delete process.env.CONCIERGE_ADMIN_EMAILS;
    else process.env.CONCIERGE_ADMIN_EMAILS = originalAdmins;
  });

  it("throws AdminAuthError(no_user) when there is no session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireAdmin()).rejects.toMatchObject({
      name: "AdminAuthError",
      reason: "no_user",
    });
  });

  it("throws AdminAuthError(not_admin) when the user is not on the allowlist", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: "user-1", email: "intruder@example.com" },
      },
    });

    await expect(requireAdmin()).rejects.toMatchObject({
      name: "AdminAuthError",
      reason: "not_admin",
    });
  });

  it("returns the user when they are on the allowlist", async () => {
    const adminUser = { id: "user-2", email: "founder@unreceipt.com" };
    mocks.getUser.mockResolvedValue({ data: { user: adminUser } });

    await expect(requireAdmin()).resolves.toEqual(adminUser);
  });

  it("matches the allowlist case-insensitively (defense against email casing)", async () => {
    process.env.CONCIERGE_ADMIN_EMAILS = "founder@unreceipt.com";
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-3", email: "Founder@UnReceipt.COM" } },
    });

    await expect(requireAdmin()).resolves.toMatchObject({ id: "user-3" });
  });

  it("AdminAuthError carries the reason code", () => {
    const err = new AdminAuthError("no_user");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AdminAuthError");
    expect(err.reason).toBe("no_user");
  });
});
