// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (row: unknown) => ({
        eq: (col: string, val: string) => ({
          select: () => mocks.update(row, col, val),
        }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/profile/country/route";

const req = (body: unknown, origin = "http://localhost:3000") =>
  new NextRequest("http://localhost:3000/api/profile/country", {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: "localhost:3000" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getServerUser.mockResolvedValue({ id: "user-1" });
  mocks.update.mockResolvedValue({ data: [{ user_id: "user-1" }], error: null });
});

describe("POST /api/profile/country", () => {
  it("saves a known country for the signed-in user only", async () => {
    const res = await POST(req({ country: "SE" }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ company_country: "SE" }, "user_id", "user-1");
  });

  it("says so when there was no profile row to save to", async () => {
    mocks.update.mockResolvedValueOnce({ data: [], error: null });
    expect((await POST(req({ country: "SE" }))).status).toBe(404);
  });

  it("refuses unknown values, other origins and anonymous callers", async () => {
    expect((await POST(req({ country: "DE" }))).status).toBe(400);
    expect((await POST(req({ country: "SE" }, "https://evil.example"))).status).toBe(403);
    mocks.getServerUser.mockResolvedValueOnce(null);
    expect((await POST(req({ country: "SE" }))).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
