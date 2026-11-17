import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  analyticsAccess: vi.fn(),
  loadAnalytics: vi.fn(),
  rateLimit: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/analytics/load", async (orig) => ({
  ...(await orig<typeof import("@/lib/analytics/load")>()),
  analyticsAccess: mocks.analyticsAccess,
  loadAnalytics: mocks.loadAnalytics,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException, captureMessage: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));

import { AnalyticsNotReadyError } from "@/lib/analytics/load";
import { GET } from "@/app/api/mobile/analytics/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "anna@firma.se" };
const req = (q = "") => new Request(`https://app.unreceipt.com/api/mobile/analytics${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(USER);
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.analyticsAccess.mockResolvedValue({ kind: "ready", home: "SEK", country: "SE" });
  mocks.loadAnalytics.mockResolvedValue({ state: "inactive" });
});

describe("GET /api/mobile/analytics", () => {
  it("answers 503 not_ready, without a Sentry report, while a new account has no company yet", async () => {
    // The home screen's first load creates the company; Insights can ask a second earlier.
    const notReady = new AnalyticsNotReadyError();
    mocks.analyticsAccess.mockRejectedValue(notReady);
    mocks.loadAnalytics.mockImplementation(async (_u, _p, _t, accessed) => accessed);
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "not_ready" });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("still answers 500 and reports any other failure", async () => {
    mocks.analyticsAccess.mockRejectedValue(new Error("analytics: default organization 57014"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  it("answers the loaded analytics when the company exists", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "inactive" });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});
