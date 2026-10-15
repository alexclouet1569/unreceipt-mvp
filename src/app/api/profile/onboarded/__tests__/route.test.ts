// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  calls: [] as unknown[][],
  result: { error: null as unknown },
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      update: (patch: unknown) => ({
        eq: (col: string, val: string) => ({
          is: async (col2: string, val2: unknown) => {
            mocks.calls.push([table, patch, col, val, col2, val2]);
            return mocks.result;
          },
        }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/profile/onboarded/route";

beforeEach(() => {
  mocks.calls = [];
  mocks.result = { error: null };
  mocks.getServerUser.mockResolvedValue({ id: "u1" });
});

describe("POST /api/profile/onboarded", () => {
  it("requires a session", async () => {
    mocks.getServerUser.mockResolvedValueOnce(null);
    expect((await POST()).status).toBe(401);
    expect(mocks.calls).toEqual([]);
  });

  it("stamps onboarded_at on the caller's own profile, once", async () => {
    expect((await POST()).status).toBe(200);
    expect(mocks.calls).toEqual([
      ["profiles", { onboarded_at: expect.any(String) }, "user_id", "u1", "onboarded_at", null],
    ]);
  });
});
