import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Stripe from "stripe";
import { NextRequest } from "next/server";

const TEST_SECRET = "whsec_test_secret_for_signature_verification";
// Real Stripe instance used purely for its webhooks helper (constructEvent +
// generateTestHeaderString) — no network calls hit this client.
const stripeForCrypto = new Stripe("sk_test_unused_for_webhooks_helper", {
  apiVersion: "2026-04-22.dahlia",
});

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: mocks.upsert,
    }),
  }),
}));

vi.mock("@/lib/stripe", async () => ({
  getStripe: () => ({
    webhooks: stripeForCrypto.webhooks,
    subscriptions: { retrieve: mocks.retrieve },
  }),
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const sign = (payload: string, secret = TEST_SECRET) =>
  stripeForCrypto.webhooks.generateTestHeaderString({ payload, secret });

const buildRequest = (
  payload: string,
  headers: Record<string, string> = {}
) =>
  new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });

const buildEvent = (overrides: {
  type: string;
  data: { object: Record<string, unknown> };
}) =>
  JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: "event",
    api_version: "2026-04-22.dahlia",
    created: Math.floor(Date.now() / 1000),
    type: overrides.type,
    data: overrides.data,
  });

const subscriptionPayload = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "sub_test_123",
  object: "subscription",
  customer: "cus_test_abc",
  status: "trialing",
  trial_end: 1_900_000_000,
  items: { data: [{ current_period_end: 1_900_500_000 }] },
  metadata: {},
  ...overrides,
});

describe("POST /api/webhooks/stripe", () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    mocks.retrieve.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  });

  it("returns 400 when the stripe-signature header is missing", async () => {
    const payload = buildEvent({
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const res = await POST(buildRequest(payload));

    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 and skips DB writes when the signature is invalid", async () => {
    const payload = buildEvent({
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const res = await POST(
      buildRequest(payload, { "stripe-signature": "t=0,v1=deadbeef" })
    );

    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("upserts on checkout.session.completed using the user_id from client_reference_id", async () => {
    mocks.retrieve.mockResolvedValue(subscriptionPayload());

    const payload = buildEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_abc",
          client_reference_id: "user-uuid-1",
          customer: "cus_test_abc",
          subscription: "sub_test_123",
          mode: "subscription",
        },
      },
    });
    const res = await POST(buildRequest(payload, { "stripe-signature": sign(payload) }));

    expect(res.status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledWith("sub_test_123");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const [row, options] = mocks.upsert.mock.calls[0];
    expect(row).toMatchObject({
      user_id: "user-uuid-1",
      stripe_customer_id: "cus_test_abc",
      stripe_subscription_id: "sub_test_123",
      status: "trialing",
    });
    expect(typeof row.current_period_end).toBe("string");
    expect(typeof row.trial_end).toBe("string");
    // Plan A1 — idempotency comes from the unique index on
    // stripe_subscription_id, surfaced via the upsert onConflict option.
    expect(options).toEqual({ onConflict: "stripe_subscription_id" });
  });

  it("delivers the same checkout.session.completed event twice with the same upsert key (idempotency contract)", async () => {
    mocks.retrieve.mockResolvedValue(subscriptionPayload());

    const payload = buildEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_abc",
          client_reference_id: "user-uuid-1",
          customer: "cus_test_abc",
          subscription: "sub_test_123",
          mode: "subscription",
        },
      },
    });
    const sig = sign(payload);

    const r1 = await POST(buildRequest(payload, { "stripe-signature": sig }));
    const r2 = await POST(buildRequest(payload, { "stripe-signature": sig }));

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0][0].stripe_subscription_id).toBe("sub_test_123");
    expect(mocks.upsert.mock.calls[1][0].stripe_subscription_id).toBe("sub_test_123");
    // The DB enforces the uniqueness — the unit test asserts the handler
    // delegates dedup to the upsert (no read-then-write race window).
    expect(mocks.upsert.mock.calls[0][1]).toEqual({
      onConflict: "stripe_subscription_id",
    });
  });

  it("upserts on customer.subscription.updated with the new status", async () => {
    const payload = buildEvent({
      type: "customer.subscription.updated",
      data: {
        object: subscriptionPayload({
          status: "active",
          metadata: { user_id: "user-uuid-9" },
        }),
      },
    });

    const res = await POST(buildRequest(payload, { "stripe-signature": sign(payload) }));

    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      stripe_subscription_id: "sub_test_123",
      status: "active",
    });
  });

  it("upserts status='canceled' on customer.subscription.deleted regardless of source status", async () => {
    const payload = buildEvent({
      type: "customer.subscription.deleted",
      data: {
        object: subscriptionPayload({
          status: "active",
          metadata: { user_id: "user-uuid-9" },
        }),
      },
    });

    const res = await POST(buildRequest(payload, { "stripe-signature": sign(payload) }));

    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].status).toBe("canceled");
  });

  it("returns 200 and skips DB writes for unknown event types", async () => {
    const payload = buildEvent({
      type: "invoice.payment_succeeded",
      data: { object: { id: "in_test" } },
    });

    const res = await POST(buildRequest(payload, { "stripe-signature": sign(payload) }));

    expect(res.status).toBe(200);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns 500 when the upsert errors so Stripe retries", async () => {
    mocks.retrieve.mockResolvedValue(subscriptionPayload());
    mocks.upsert.mockResolvedValue({ error: { message: "DB exploded" } });

    const payload = buildEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_abc",
          client_reference_id: "user-uuid-1",
          customer: "cus_test_abc",
          subscription: "sub_test_123",
          mode: "subscription",
        },
      },
    });

    const res = await POST(buildRequest(payload, { "stripe-signature": sign(payload) }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is unset (refuse to accept events without verifying)", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const payload = buildEvent({
      type: "checkout.session.completed",
      data: { object: {} },
    });

    const res = await POST(
      buildRequest(payload, { "stripe-signature": sign(payload, TEST_SECRET) })
    );

    expect(res.status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
