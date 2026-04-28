import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mocks.getServerUser,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: mocks.createSession } },
  }),
}));

import { POST } from "@/app/api/checkout/route";

const adminUser = { id: "user-1", email: "founder@unreceipt.io" };

const buildRequest = () =>
  new NextRequest("http://localhost:3000/api/checkout", { method: "POST" });

describe("POST /api/checkout", () => {
  const originalPrice = process.env.STRIPE_PRICE_ID;

  beforeEach(() => {
    process.env.STRIPE_PRICE_ID = "price_test_123";
    mocks.getServerUser.mockReset();
    mocks.createSession.mockReset();
  });

  afterEach(() => {
    if (originalPrice === undefined) delete process.env.STRIPE_PRICE_ID;
    else process.env.STRIPE_PRICE_ID = originalPrice;
  });

  it("returns 401 when there is no authenticated user", async () => {
    mocks.getServerUser.mockResolvedValue(null);

    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("returns 500 when STRIPE_PRICE_ID is missing", async () => {
    delete process.env.STRIPE_PRICE_ID;
    mocks.getServerUser.mockResolvedValue(adminUser);

    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates a Checkout Session with the locked WOZ parameters", async () => {
    mocks.getServerUser.mockResolvedValue(adminUser);
    mocks.createSession.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_test_xyz",
    });

    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/c/pay/cs_test_xyz");

    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    const args = mocks.createSession.mock.calls[0][0];

    expect(args).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_test_123", quantity: 1 }],
      subscription_data: { trial_period_days: 7 }, // CMT1 — 7, not 30
      client_reference_id: adminUser.id, // A3 — sign-in-first, link to auth user
      customer_email: adminUser.email,
      allow_promotion_codes: true,
    });
    // A4 — success_url MUST contain the literal Stripe placeholder so /app
    // can self-heal in step 5.
    expect(args.success_url).toBe(
      "http://localhost:3000/app?session_id={CHECKOUT_SESSION_ID}"
    );
    expect(args.cancel_url).toBe("http://localhost:3000/subscribe?canceled=1");
  });

  it("returns 502 when Stripe returns a session without a URL", async () => {
    mocks.getServerUser.mockResolvedValue(adminUser);
    mocks.createSession.mockResolvedValue({ url: null });

    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
  });

  it("returns 502 with a safe message when Stripe throws", async () => {
    mocks.getServerUser.mockResolvedValue(adminUser);
    mocks.createSession.mockRejectedValue(new Error("Stripe is down"));

    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/checkout/i);
    expect(body.error).not.toMatch(/Stripe is down/);
  });
});
