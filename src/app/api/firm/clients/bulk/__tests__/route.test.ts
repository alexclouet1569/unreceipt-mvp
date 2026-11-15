// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ ctx: vi.fn(), limit: vi.fn(), create: vi.fn(), known: [] as string[], filters: [] as unknown[][] }));
vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: () => m.ctx(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => m.limit(...a),
  rateLimitedResponse: () => Response.json({ error: "rate_limited" }, { status: 429 }),
}));
vi.mock("@/lib/firm/create-invite", () => ({ createFirmInvite: (...a: unknown[]) => m.create(...a) }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (...a: unknown[]) => (m.filters.push(["eq", ...a]), chain),
        in: (...a: unknown[]) => (m.filters.push(["in", ...a]), chain),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: m.known.map((e) => ({ invited_email: e })), error: null }),
      };
      return chain;
    },
  }),
}));

import { POST } from "../route";

const CTX = { user: { id: "u-1" }, firmId: "firm-1", firmName: "Byrån AB", role: "staff" };
const req = (invites: unknown) =>
  new NextRequest("https://app.unreceipt.com/api/firm/clients/bulk", {
    method: "POST",
    headers: { origin: "https://app.unreceipt.com", host: "app.unreceipt.com", "content-type": "application/json" },
    body: JSON.stringify({ invites }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.known = [];
  m.filters = [];
  m.ctx.mockResolvedValue(CTX);
  m.limit.mockResolvedValue({ ok: true });
  m.create.mockResolvedValue({ ok: true, id: "x", emailed: true });
});

describe("POST /api/firm/clients/bulk", () => {
  it("invites each new address once, for the session's firm, and skips known ones", async () => {
    m.known = ["old@client.se"];
    const res = await POST(
      req([
        { client_name: "Nordljus AB", email: "Maja@Nordljus.se" },
        { email: "maja@nordljus.se" },
        { email: "old@client.se" },
        { email: "not an address" },
      ]),
    );
    expect(res.status).toBe(201);
    const { lines } = await res.json();
    expect(lines).toEqual(
      expect.arrayContaining([
        { email: "maja@nordljus.se", status: "sent" },
        { email: "old@client.se", status: "skipped" },
        { email: "not an address", status: "invalid" },
      ]),
    );
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({ firmId: "firm-1", invitedBy: "u-1", clientName: "Nordljus AB", email: "maja@nordljus.se" }),
    );
    expect(m.filters).toContainEqual(["eq", "firm_id", "firm-1"]);
    expect(m.limit).toHaveBeenCalledWith("firmInviteBulk", "firm-1");
  });

  it("refuses a typed company name with a web address, but never the address standing in for a name", async () => {
    const res = await POST(req([{ client_name: "Visit www.evil.example now", email: "a@b.se" }, { email: "c@d.se" }]));
    const { lines } = await res.json();
    expect(lines).toContainEqual({ email: "a@b.se", status: "bad_name" });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ email: "c@d.se", clientName: "c@d.se" }));
  });

  it("uses the address as the name when none is given", async () => {
    await POST(req([{ email: "anna@hallonbygg.se" }]));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ clientName: "anna@hallonbygg.se" }));
  });

  it("refuses more than 25, none at all, and an over-limit firm", async () => {
    expect((await POST(req(Array.from({ length: 26 }, (_, i) => ({ email: `c${i}@x.se` }))))).status).toBe(400);
    expect((await POST(req([])))).toHaveProperty("status", 400);
    m.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    expect((await POST(req([{ email: "a@b.se" }]))).status).toBe(429);
    expect(m.create).not.toHaveBeenCalled();
  });
});
