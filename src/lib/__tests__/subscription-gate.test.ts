import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn<() => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: mocks.query,
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { checkSubscriptionGate } from "@/lib/subscription-gate";

const userId = "user-1";

describe("checkSubscriptionGate", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("allows an active subscription", async () => {
    mocks.query.mockResolvedValue({
      data: { status: "active", current_period_end: null, trial_end: null },
      error: null,
    });
    expect(await checkSubscriptionGate(userId, null)).toEqual({ kind: "allow" });
  });

  it("allows a trialing subscription", async () => {
    mocks.query.mockResolvedValue({
      data: { status: "trialing", current_period_end: null, trial_end: null },
      error: null,
    });
    expect(await checkSubscriptionGate(userId, null)).toEqual({ kind: "allow" });
  });

  it("redirects to /subscribe for canceled subscriptions", async () => {
    mocks.query.mockResolvedValue({
      data: { status: "canceled", current_period_end: null, trial_end: null },
      error: null,
    });
    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "redirect_subscribe",
    });
  });

  it("redirects to /subscribe for past_due", async () => {
    mocks.query.mockResolvedValue({
      data: { status: "past_due", current_period_end: null, trial_end: null },
      error: null,
    });
    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "redirect_subscribe",
    });
  });

  it("redirects to /subscribe for unpaid", async () => {
    mocks.query.mockResolvedValue({
      data: { status: "unpaid", current_period_end: null, trial_end: null },
      error: null,
    });
    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "redirect_subscribe",
    });
  });

  it("redirects to /subscribe when no row exists and no session_id is in the URL", async () => {
    mocks.query.mockResolvedValue({ data: null, error: null });
    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "redirect_subscribe",
    });
  });

  it("requests self_heal when no row exists but session_id is in the URL", async () => {
    mocks.query.mockResolvedValue({ data: null, error: null });
    expect(await checkSubscriptionGate(userId, "cs_test_xyz")).toEqual({
      kind: "self_heal",
      sessionId: "cs_test_xyz",
    });
  });

  it("fails OPEN (allow_with_warning) when the supabase response carries an error", async () => {
    mocks.query.mockResolvedValue({
      data: null,
      error: { message: "DB exploded" },
    });
    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "allow_with_warning",
      reason: "db_error",
    });
  });

  it("fails OPEN (allow_with_warning) when the supabase call throws", async () => {
    mocks.query.mockRejectedValue(new Error("network blip"));
    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "allow_with_warning",
      reason: "db_error",
    });
  });

  it("fails OPEN even when session_id is present (DB error trumps self_heal)", async () => {
    mocks.query.mockRejectedValue(new Error("network blip"));
    expect(
      await checkSubscriptionGate(userId, "cs_test_xyz")
    ).toEqual({
      kind: "allow_with_warning",
      reason: "db_error",
    });
  });
});

describe("checkSubscriptionGate — PILOT_MODE", () => {
  const originalPilot = process.env.PILOT_MODE;

  beforeEach(() => {
    mocks.query.mockReset();
  });

  afterEach(() => {
    if (originalPilot === undefined) delete process.env.PILOT_MODE;
    else process.env.PILOT_MODE = originalPilot;
  });

  it("bypasses the DB query and returns pilot_mode when PILOT_MODE='true' with no subscription row", async () => {
    process.env.PILOT_MODE = "true";
    mocks.query.mockResolvedValue({ data: null, error: null });

    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "allow_with_warning",
      reason: "pilot_mode",
    });
    // Pilot mode short-circuits — the gate should not even ask the DB.
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns pilot_mode even when an active subscription row exists (pilot takes precedence)", async () => {
    process.env.PILOT_MODE = "true";
    mocks.query.mockResolvedValue({
      data: { status: "active", current_period_end: null, trial_end: null },
      error: null,
    });

    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "allow_with_warning",
      reason: "pilot_mode",
    });
  });

  it("preserves existing behavior when PILOT_MODE is unset", async () => {
    delete process.env.PILOT_MODE;
    mocks.query.mockResolvedValue({ data: null, error: null });

    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "redirect_subscribe",
    });
  });

  it("preserves existing behavior when PILOT_MODE='false' (string compare, not boolean coercion)", async () => {
    process.env.PILOT_MODE = "false";
    mocks.query.mockResolvedValue({ data: null, error: null });

    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "redirect_subscribe",
    });
  });

  it("requires literal 'true' — values like '1' or 'TRUE' do NOT activate pilot mode", async () => {
    process.env.PILOT_MODE = "1";
    mocks.query.mockResolvedValue({ data: null, error: null });

    expect(await checkSubscriptionGate(userId, null)).toEqual({
      kind: "redirect_subscribe",
    });
  });
});
