// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  getNativeApp: vi.fn(),
  rateLimit: vi.fn(),
  loadBillingAccount: vi.fn(),
  createPortal: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/native-app-server", () => ({ getNativeApp: mocks.getNativeApp }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/stripe-billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stripe-billing")>()),
  loadBillingAccount: mocks.loadBillingAccount,
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ billingPortal: { sessions: { create: mocks.createPortal } } }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/billing/portal/route";

function req(headers: Record<string, string> = {}) {
  return new NextRequest("https://app.unreceipt.com/api/billing/portal", {
    method: "POST",
    headers: { host: "app.unreceipt.com", origin: "https://app.unreceipt.com", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_APP_URL;
  mocks.getNativeApp.mockResolvedValue(null);
  mocks.getServerUser.mockResolvedValue({ id: "u1", email: "anna@example.se" });
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.loadBillingAccount.mockResolvedValue({
    customerId: "cus_123",
    hasLiveSubscription: true,
    hadSubscription: true,
  });
  mocks.createPortal.mockResolvedValue({ url: "https://billing.stripe.com/p/session/x" });
});

describe("POST /api/billing/portal", () => {
  it("opens the customer portal and returns to Settings on the product host", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://billing.stripe.com/p/session/x" });
    expect(mocks.createPortal).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://app.unreceipt.com/app/settings",
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith("billingPortal", "u1");
  });

  it("answers 403 inside the store apps (no purchase management there)", async () => {
    mocks.getNativeApp.mockResolvedValue({ platform: "ios", version: "1.0.0" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("refuses a cross-site POST", async () => {
    const res = await POST(req({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(mocks.getServerUser).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    expect((await POST(req())).status).toBe(401);
  });

  it("answers 429 when rate-limited", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("answers 404 when the account has no Stripe customer", async () => {
    mocks.loadBillingAccount.mockResolvedValue({
      customerId: null,
      hasLiveSubscription: false,
      hadSubscription: false,
    });
    expect((await POST(req())).status).toBe(404);
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("answers 503 when the lookup fails, 502 when Stripe refuses", async () => {
    mocks.loadBillingAccount.mockRejectedValueOnce(new Error("db down"));
    expect((await POST(req())).status).toBe(503);

    mocks.createPortal.mockRejectedValueOnce(new Error("No configuration provided"));
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/configuration/);
  });
});
