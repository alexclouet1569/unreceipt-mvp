// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ ctx: vi.fn(), limit: vi.fn(), replace: vi.fn(), off: vi.fn() }));
vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: () => m.ctx(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => m.limit(...a),
  rateLimitedResponse: () => Response.json({ error: "rate_limited" }, { status: 429 }),
}));
vi.mock("@/lib/firm/join-link", async (orig) => ({
  ...(await orig<typeof import("@/lib/firm/join-link")>()),
  replaceJoinCode: (...a: unknown[]) => m.replace(...a),
  turnOffJoinLink: (...a: unknown[]) => m.off(...a),
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/app-url", () => ({ absoluteAppUrl: (p: string) => `https://app.unreceipt.com${p}` }));

import { POST } from "../route";

const req = (action: string) =>
  new NextRequest("https://app.unreceipt.com/api/firm/join-link", {
    method: "POST",
    headers: { origin: "https://app.unreceipt.com", host: "app.unreceipt.com", "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx.mockResolvedValue({ user: { id: "u-admin" }, firmId: "firm-1", firmName: "Byrån AB", role: "admin" });
  m.limit.mockResolvedValue({ ok: true });
  m.replace.mockResolvedValue("ZyXwVuTsRqPoNmLkJiHgFe");
});

describe("POST /api/firm/join-link", () => {
  it("lets an admin make a new link for the session's firm", async () => {
    const res = await POST(req("replace"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: "https://app.unreceipt.com/app/connect/ZyXwVuTsRqPoNmLkJiHgFe" });
    expect(m.replace).toHaveBeenCalledWith("firm-1");
  });

  it("lets an admin turn it off", async () => {
    expect((await POST(req("off"))).status).toBe(200);
    expect(m.off).toHaveBeenCalledWith("firm-1");
  });

  it("refuses staff and anything else", async () => {
    m.ctx.mockResolvedValue({ user: { id: "u-staff" }, firmId: "firm-1", firmName: "Byrån AB", role: "staff" });
    expect((await POST(req("replace"))).status).toBe(403);
    m.ctx.mockResolvedValue({ user: { id: "u-admin" }, firmId: "firm-1", firmName: "Byrån AB", role: "admin" });
    expect((await POST(req("delete-everything"))).status).toBe(400);
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.off).not.toHaveBeenCalled();
  });
});
