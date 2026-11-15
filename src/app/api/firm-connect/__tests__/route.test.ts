// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ user: vi.fn(), limit: vi.fn(), target: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: () => m.user() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => m.limit(...a),
  rateLimitedResponse: (s: number) => Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(s) } }),
}));
vi.mock("@/lib/firm/join-link", async (orig) => ({
  ...(await orig<typeof import("@/lib/firm/join-link")>()),
  loadJoinTarget: (...a: unknown[]) => m.target(...a),
}));
vi.mock("@/lib/firm/connect", () => ({ connectToFirm: (...a: unknown[]) => m.connect(...a) }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { POST } from "../route";

const CODE = "AbCdEfGhIjKlMnOpQrStUv";
const req = (body: unknown, origin = "https://app.unreceipt.com") =>
  new NextRequest("https://app.unreceipt.com/api/firm-connect", {
    method: "POST",
    headers: { origin, host: "app.unreceipt.com", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: "user-1" });
  m.limit.mockResolvedValue({ ok: true });
  m.target.mockResolvedValue({ firmId: "firm-1", firmName: "Byrån AB", adminDomain: null });
  m.connect.mockResolvedValue({ ok: true });
});

describe("POST /api/firm-connect", () => {
  it("refuses another site, and a signed-out caller", async () => {
    expect((await POST(req({ code: CODE }, "https://evil.example"))).status).toBe(403);
    m.user.mockResolvedValue(null);
    expect((await POST(req({ code: CODE }))).status).toBe(401);
    expect(m.connect).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed or unknown code, before connecting anything", async () => {
    expect((await POST(req({ code: "nope" }))).status).toBe(404);
    m.target.mockResolvedValue(null);
    expect((await POST(req({ code: CODE }))).status).toBe(404);
    expect(m.connect).not.toHaveBeenCalled();
  });

  it("connects the signed-in user's company to the code's firm", async () => {
    const res = await POST(req({ code: CODE }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, firmName: "Byrån AB" });
    expect(m.limit).toHaveBeenCalledWith("firmConnect", "user-1");
    expect(m.connect).toHaveBeenCalledWith({ id: "user-1" }, { firmId: "firm-1", firmName: "Byrån AB", adminDomain: null });
  });

  it("explains a refusal", async () => {
    m.connect.mockResolvedValue({ ok: false, reason: "other_firm" });
    const res = await POST(req({ code: CODE }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("other_firm");
  });

  it("is rate limited", async () => {
    m.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    expect((await POST(req({ code: CODE }))).status).toBe(429);
    expect(m.target).not.toHaveBeenCalled();
  });
});
