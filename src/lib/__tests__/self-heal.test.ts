import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { retrieve: mocks.retrieve } },
  }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: mocks.upsert,
    }),
  }),
}));

import { handleSelfHeal } from "@/lib/self-heal";

const userId = "user-self-heal-1";
const sessionId = "cs_test_self_heal_xyz";

const paidSession = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  id: sessionId,
  payment_status: "paid",
  status: "complete",
  customer: "cus_test_abc",
  subscription: {
    id: "sub_test_123",
    status: "trialing",
    customer: "cus_test_abc",
    trial_end: 1_900_000_000,
    items: { data: [{ current_period_end: 1_900_500_000 }] },
  },
  ...overrides,
});

describe("handleSelfHeal", () => {
  beforeEach(() => {
    mocks.retrieve.mockReset();
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
  });

  it("upserts the subscription and returns 'success' when the session is paid", async () => {
    mocks.retrieve.mockResolvedValue(paidSession());

    const outcome = await handleSelfHeal(userId, sessionId);

    expect(outcome).toBe("success");
    expect(mocks.retrieve).toHaveBeenCalledWith(sessionId, {
      expand: ["subscription"],
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const [row, options] = mocks.upsert.mock.calls[0];
    expect(row).toMatchObject({
      user_id: userId,
      stripe_customer_id: "cus_test_abc",
      stripe_subscription_id: "sub_test_123",
      status: "trialing",
    });
    expect(typeof row.current_period_end).toBe("string");
    expect(typeof row.trial_end).toBe("string");
    // Idempotent on retry — same key as the webhook handler uses.
    expect(options).toEqual({ onConflict: "stripe_subscription_id" });
  });

  it("returns 'not_paid' and skips upsert for an unpaid session", async () => {
    mocks.retrieve.mockResolvedValue(
      paidSession({ payment_status: "unpaid", status: "open" })
    );

    const outcome = await handleSelfHeal(userId, sessionId);

    expect(outcome).toBe("not_paid");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns 'not_paid' if the session has no expanded subscription object", async () => {
    mocks.retrieve.mockResolvedValue(
      paidSession({ subscription: "sub_only_string" })
    );

    const outcome = await handleSelfHeal(userId, sessionId);

    expect(outcome).toBe("not_paid");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns 'stripe_down' when the Stripe lookup throws", async () => {
    mocks.retrieve.mockRejectedValue(new Error("stripe is unreachable"));

    const outcome = await handleSelfHeal(userId, sessionId);

    expect(outcome).toBe("stripe_down");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns 'stripe_down' when the upsert errors so the spinner shows + the gate retries", async () => {
    mocks.retrieve.mockResolvedValue(paidSession());
    mocks.upsert.mockResolvedValue({ error: { message: "DB exploded" } });

    const outcome = await handleSelfHeal(userId, sessionId);

    expect(outcome).toBe("stripe_down");
  });
});
