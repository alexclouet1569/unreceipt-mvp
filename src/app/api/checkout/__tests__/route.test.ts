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

const adminUser = { id: "user-1", email: "founder@unreceipt.com" };

const buildRequest = (
  body: unknown = { plan: "regular", employees: 12 }
) =>
  new NextRequest("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const PRICE_ENV = {
  STRIPE_PRICE_LIGHT: "price_light",
  STRIPE_PRICE_REGULAR: "price_regular",
  STRIPE_PRICE_HEAVY: "price_heavy",
};

describe("POST /api/checkout", () => {
  const original = Object.fromEntries(
    Object.keys(PRICE_ENV).map((k) => [k, process.env[k]])
  );

  beforeEach(() => {
    Object.assign(process.env, PRICE_ENV);
    mocks.getServerUser.mockReset();
    mocks.createSession.mockReset();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns 401 when there is no authenticated user", async () => {
    mocks.getServerUser.mockResolvedValue(null);

    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it.each([
    [null],
    [{}],
    [{ plan: "enterprise", employees: 5 }],
    [{ plan: "regular", employees: 0 }],
    [{ plan: "regular", employees: 2.5 }],
    [{ plan: "regular", employees: 10_000 }],
  ])("returns 400 for an invalid body %j", async (body) => {
    mocks.getServerUser.mockResolvedValue(adminUser);

    const res = await POST(buildRequest(body));
    expect(res.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("returns 500 — and never falls back to another price — when the plan's price is missing", async () => {
    delete process.env.STRIPE_PRICE_HEAVY;
    mocks.getServerUser.mockResolvedValue(adminUser);

    const res = await POST(buildRequest({ plan: "heavy", employees: 3 }));
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
      // Per-employee pricing: the chosen plan's price × employees.
      line_items: [{ price: "price_regular", quantity: 12 }],
      subscription_data: {
        trial_period_days: 7, // CMT1 — 7, not 30
        metadata: { user_id: adminUser.id, plan: "regular" }, // read by the subscription.* webhooks
      },
      client_reference_id: adminUser.id, // A3 — sign-in-first, link to auth user
      customer_email: adminUser.email,
      // Step 10 / CMT2 — Stripe Tax wired in. Stripe collects VAT
      // automatically when our Tax registrations are configured in the
      // Dashboard; harmless no-op for jurisdictions where we're not
      // registered yet.
      automatic_tax: { enabled: true },
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
