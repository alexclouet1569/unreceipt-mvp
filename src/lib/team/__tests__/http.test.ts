// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ user: null as null | { id: string }, limited: false }));
vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => (mocks.limited ? { ok: false, retryAfterSeconds: 60 } : { ok: true }),
  rateLimitedResponse: (s: number) => Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(s) } }),
}));

import { teamGuard } from "../http";

const req = (headers: Record<string, string>, method = "POST") =>
  new NextRequest("https://app.unreceipt.com/api/team", { method, headers: { host: "app.unreceipt.com", ...headers }, body: method === "DELETE" ? undefined : "{}" });

beforeEach(() => {
  mocks.user = { id: "u1" };
  mocks.limited = false;
});

describe("teamGuard", () => {
  it("refuses a write from another site", async () => {
    const g = await teamGuard(req({ origin: "https://evil.test", "content-type": "application/json" }), { write: true });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });

  it("refuses a write that isn't JSON (a cross-site form can't send JSON)", async () => {
    const g = await teamGuard(req({ "content-type": "text/plain" }), { write: true });
    if (g.ok) throw new Error("expected a refusal");
    expect(g.response.status).toBe(415);
  });

  it("lets the iPhone app write without an Origin, and a DELETE without a body", async () => {
    expect((await teamGuard(req({ "content-type": "application/json" }), { write: true })).ok).toBe(true);
    expect((await teamGuard(req({}, "DELETE"), { write: true })).ok).toBe(true);
  });

  it("needs a signed-in user, and applies the rate limit", async () => {
    mocks.user = null;
    let g = await teamGuard(req({ "content-type": "application/json" }), { write: true });
    if (g.ok) throw new Error("expected a refusal");
    expect(g.response.status).toBe(401);
    mocks.user = { id: "u1" };
    mocks.limited = true;
    g = await teamGuard(req({ "content-type": "application/json" }), { write: true, limit: "teamAction" });
    if (g.ok) throw new Error("expected a refusal");
    expect(g.response.status).toBe(429);
  });
});
