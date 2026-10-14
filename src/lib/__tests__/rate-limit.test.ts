// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));

import { RATE_LIMITS, rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("allows the request when every window is under its limit", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(rateLimit("ocr", "user-1")).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledTimes(RATE_LIMITS.ocr.length);
    expect(mocks.rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "ocr:3600:user-1",
      p_window_seconds: 3600,
      p_limit: 60,
    });
  });

  it("blocks as soon as one window is over, with a Retry-After inside that window", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });

    const result = await rateLimit("ocr", "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(3600);
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("fails open when the counter errors (e.g. SQL not applied yet)", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });

    await expect(rateLimit("capture", "user-1")).resolves.toEqual({ ok: true });
  });
});

describe("rateLimitedResponse", () => {
  it("is a 429 with a Retry-After header", async () => {
    const res = rateLimitedResponse(42);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
  });
});
