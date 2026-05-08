import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn<(payload: unknown, options?: unknown) => Promise<{ error: unknown }>>(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: mocks.upsert,
    }),
  }),
}));

import { syncProfile } from "@/lib/profile-sync";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("syncProfile", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.upsert.mockResolvedValue({ error: null });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("upserts the profile with both name and company when present", async () => {
    await syncProfile(USER_ID, {
      full_name: "Alex Andersson",
      company_name: "Acme AB",
    });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        full_name: "Alex Andersson",
        company_name: "Acme AB",
      },
      { onConflict: "user_id" }
    );
  });

  it("trims whitespace and writes nulls for empty strings", async () => {
    await syncProfile(USER_ID, {
      full_name: "  Alex  ",
      company_name: "   ",
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        full_name: "Alex",
        company_name: null,
      },
      expect.anything()
    );
  });

  it("writes nulls for magic-link users with no metadata", async () => {
    await syncProfile(USER_ID, null);

    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        full_name: null,
        company_name: null,
      },
      expect.anything()
    );
  });

  it("ignores non-string metadata values rather than crashing", async () => {
    await syncProfile(USER_ID, {
      full_name: 42 as unknown as string,
      company_name: { not: "a string" } as unknown as string,
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        full_name: null,
        company_name: null,
      },
      expect.anything()
    );
  });

  it("logs but does not throw when the upsert fails", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "permission denied" } });

    await expect(
      syncProfile(USER_ID, { full_name: "Alex" })
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
