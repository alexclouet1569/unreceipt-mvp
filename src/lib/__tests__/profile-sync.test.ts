import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn<(payload: unknown, options?: unknown) => Promise<{ error: unknown }>>(),
  update: vi.fn<(payload: unknown) => void>(),
  filters: [] as [string, string, unknown][],
  updateError: null as unknown,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: mocks.upsert,
      update: (payload: unknown) => {
        mocks.update(payload);
        const chain = {
          eq: (col: string, v: unknown) => (mocks.filters.push(["eq", col, v]), chain),
          is: (col: string, v: unknown) => {
            mocks.filters.push(["is", col, v]);
            return Promise.resolve({ error: mocks.updateError });
          },
        };
        return chain;
      },
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
    mocks.update.mockReset();
    mocks.filters = [];
    mocks.updateError = null;
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
        id: USER_ID,
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
        id: USER_ID,
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
        id: USER_ID,
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
        id: USER_ID,
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

  it("writes the signup source once, checked again, only while it is empty", async () => {
    await syncProfile(USER_ID, {
      full_name: "Alex",
      signup_source: { utm_source: "test", utm_campaign: "x", landing: "/sv", email: "a@b.se", ref: "unreceipt.com" },
    });

    expect(mocks.update).toHaveBeenCalledWith({
      signup_source: { utm_source: "test", utm_campaign: "x", landing: "/sv" },
    });
    expect(mocks.filters).toEqual([
      ["eq", "user_id", USER_ID],
      ["is", "signup_source", null],
    ]);
  });

  it("writes no signup source when none or only junk was given", async () => {
    await syncProfile(USER_ID, { full_name: "Alex" });
    await syncProfile(USER_ID, { signup_source: "linkedin" });
    await syncProfile(USER_ID, { signup_source: ["x"] });
    await syncProfile(USER_ID, { signup_source: { utm_source: "<b>" } });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("logs but does not throw when the signup source update fails", async () => {
    mocks.updateError = { code: "42703" };
    await expect(syncProfile(USER_ID, { signup_source: { utm_source: "test" } })).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith("[profile-sync] signup_source update failed", "42703");
  });
});
