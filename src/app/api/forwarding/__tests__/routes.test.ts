// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111", email: "anna@acme.se" } as { id: string; email?: string } | null,
  confirmation: { data: null as unknown, error: null as unknown },
  latest: { data: null as unknown, error: null as unknown },
  eqs: [] as [string, unknown][],
  send: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => {
          mocks.eqs.push([c, v]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => (table === "receipts" ? mocks.latest : mocks.confirmation),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.send }));
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.limit,
}));

import { GET } from "@/app/api/forwarding/status/route";
import { POST } from "@/app/api/forwarding/send-link/route";

describe("/api/forwarding/status", () => {
  beforeEach(() => {
    mocks.user = { id: "11111111-1111-4111-8111-111111111111", email: "anna@acme.se" };
    mocks.confirmation = { data: null, error: null };
    mocks.latest = { data: null, error: null };
    mocks.eqs = [];
  });

  it("needs a signed-in user", async () => {
    mocks.user = null;
    expect((await GET()).status).toBe(401);
  });

  it("returns a fresh code and the latest email time, scoped to the caller", async () => {
    const receivedAt = new Date().toISOString();
    mocks.confirmation = { data: { code: "593872831", for_address: "anna@gmail.com", received_at: receivedAt }, error: null };
    mocks.latest = { data: { created_at: "2026-10-16T12:00:00Z" }, error: null };
    const body = await (await GET()).json();
    expect(body).toEqual({
      confirmation: { code: "593872831", forAddress: "anna@gmail.com", receivedAt },
      lastEmailAt: "2026-10-16T12:00:00Z",
    });
    expect(mocks.eqs.filter(([c]) => c === "user_id").every(([, v]) => v === mocks.user?.id)).toBe(true);
  });

  it("drops a code older than 7 days", async () => {
    mocks.confirmation = { data: { code: "1234567", for_address: null, received_at: "2020-01-01T00:00:00Z" }, error: null };
    expect((await (await GET()).json()).confirmation).toBeNull();
  });
});

describe("/api/forwarding/send-link", () => {
  beforeEach(() => {
    mocks.user = { id: "11111111-1111-4111-8111-111111111111", email: "anna@acme.se" };
    mocks.send.mockReset().mockResolvedValue({ ok: true, id: "x" });
    mocks.limit.mockReset().mockResolvedValue({ ok: true });
  });

  it("emails the setup link to the caller's own sign-in address only", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "anna@acme.se", tag: "forwarding_setup" }),
    );
    expect(mocks.send.mock.calls[0][0].text).toContain("/app/settings/forwarding");
    expect(mocks.limit).toHaveBeenCalledWith("forwardingLink", mocks.user?.id);
  });

  it("is rate-limited", async () => {
    mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    expect((await POST()).status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
