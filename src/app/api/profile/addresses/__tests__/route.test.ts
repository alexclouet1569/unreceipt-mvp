// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  count: 0,
  upsert: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/email-alias", () => ({ INBOUND_DOMAIN_DEFAULT: "in.unreceipt.com" }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ count: mocks.count, error: null }) }),
      upsert: async (row: unknown, opts: unknown) => {
        mocks.upsert(row, opts);
        return { error: null };
      },
      delete: () => ({
        eq: (_c1: string, v1: string) => ({
          eq: async (_c2: string, v2: string) => {
            mocks.del(v1, v2);
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

import { DELETE, POST } from "@/app/api/profile/addresses/route";

const req = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/profile/addresses", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/profile/addresses", () => {
  beforeEach(() => {
    mocks.user = { id: "11111111-1111-4111-8111-111111111111" };
    mocks.count = 0;
    mocks.upsert.mockReset();
    mocks.del.mockReset();
  });

  it("needs a signed-in user", async () => {
    mocks.user = null;
    expect((await POST(req("POST", { address: "a@b.se" }))).status).toBe(401);
  });

  it("adds an address for the caller only, lower-cased", async () => {
    const res = await POST(req("POST", { address: "  Anna@Acme.SE " }));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { user_id: "11111111-1111-4111-8111-111111111111", address: "anna@acme.se" },
      { onConflict: "user_id,address", ignoreDuplicates: true },
    );
  });

  it("refuses non-addresses, forwarding aliases and more than 10", async () => {
    expect((await POST(req("POST", { address: "nope" }))).status).toBe(400);
    expect((await POST(req("POST", { address: "receipts+x@in.unreceipt.com" }))).status).toBe(400);
    mocks.count = 10;
    expect((await POST(req("POST", { address: "a@b.se" }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("removes only the caller's address", async () => {
    const res = await DELETE(req("DELETE", { address: "anna@acme.se" }));
    expect(res.status).toBe(200);
    expect(mocks.del).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "anna@acme.se");
  });
});
