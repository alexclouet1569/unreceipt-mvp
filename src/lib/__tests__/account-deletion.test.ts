// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";

type Call = { op: string; args: unknown[] };

const state = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; args: unknown[] }>,
  subscriptions: [] as Array<{
    stripe_customer_id?: string;
    stripe_subscription_id: string;
    status: string;
  }>,
  stripeSubs: [] as Array<{ id: string; status: string }>,
  searchSubs: [] as Array<{ id: string; status: string }>,
  files: {} as Record<string, Record<string, Array<{ name: string; id: string | null }>>>,
  removeError: null as null | { message: string },
  deleteUserError: null as null | { message: string },
  cancel: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      cancel: state.cancel,
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield* state.stripeSubs;
        },
      }),
      search: () => ({
        async *[Symbol.asyncIterator]() {
          yield* state.searchSubs;
        },
      }),
    },
  }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({
          data: table === "subscriptions" ? state.subscriptions : [],
          error: null,
        }),
      }),
      delete: () => ({
        eq: async (col: string, val: string) => {
          state.calls.push({ op: `delete:${table}`, args: [col, val] });
          return { error: null };
        },
        like: async (col: string, val: string) => {
          state.calls.push({ op: `delete:${table}`, args: [col, val] });
          return { error: null };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string) => ({
          data: state.files[bucket]?.[folder] ?? [],
          error: null,
        }),
        remove: async (paths: string[]) => {
          state.calls.push({ op: `remove:${bucket}`, args: paths });
          return { error: state.removeError };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          state.calls.push({ op: "deleteUser", args: [id] });
          return { error: state.deleteUserError };
        },
      },
    },
  }),
}));

import {
  AccountDeletionError,
  deleteAccount,
  isFreshSignIn,
  sessionAuthTime,
} from "@/lib/account-deletion";

const ops = () => state.calls.map((c: Call) => c.op);

beforeEach(() => {
  state.calls = [];
  state.subscriptions = [];
  state.stripeSubs = [];
  state.searchSubs = [];
  delete process.env.STRIPE_SECRET_KEY;
  state.files = {};
  state.removeError = null;
  state.deleteUserError = null;
  state.cancel.mockReset().mockResolvedValue({});
});

describe("deleteAccount", () => {
  it("cancels live subscriptions, removes files in every bucket, then rows and the user", async () => {
    state.subscriptions = [
      { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_live", status: "active" },
      { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_old", status: "canceled" },
    ];
    state.stripeSubs = [
      { id: "sub_live", status: "active" },
      { id: "sub_old", status: "canceled" },
    ];
    state.files = {
      receipts: { [USER_ID]: [{ name: "a.jpg", id: "1" }] },
      "receipt-originals": {
        [USER_ID]: [
          { name: "b.eml", id: "2" },
          { name: "sub", id: null },
        ],
        [`${USER_ID}/sub`]: [{ name: "c.pdf", id: "3" }],
      },
    };

    const result = await deleteAccount(USER_ID, { email: "Owner@Example.se" });

    expect(state.cancel).toHaveBeenCalledTimes(1);
    expect(state.cancel).toHaveBeenCalledWith("sub_live");
    expect(result).toEqual({ canceledSubscriptions: 1, removedFiles: 3 });
    expect(ops()).toEqual([
      "remove:receipts",
      "remove:receipt-originals",
      "delete:receipts",
      "deleteUser",
      "delete:rate_limits",
      "delete:waitlist",
    ]);
    const originals = state.calls.find((c) => c.op === "remove:receipt-originals")!;
    expect(originals.args).toEqual([`${USER_ID}/b.eml`, `${USER_ID}/sub/c.pdf`]);
    const waitlist = state.calls.find((c) => c.op === "delete:waitlist")!;
    expect(waitlist.args).toEqual(["email", "owner@example.se"]);
  });

  it("stops before deleting anything when Stripe can't cancel", async () => {
    state.subscriptions = [
      { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_live", status: "trialing" },
    ];
    state.cancel.mockRejectedValueOnce(Object.assign(new Error("down"), { code: "api_error" }));

    await expect(deleteAccount(USER_ID)).rejects.toMatchObject({ step: "stripe" });
    expect(ops()).toEqual([]);
  });

  it("treats a subscription Stripe no longer has as cancelled", async () => {
    state.subscriptions = [
      { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_gone", status: "active" },
    ];
    state.cancel.mockRejectedValueOnce(
      Object.assign(new Error("No such subscription"), { code: "resource_missing" }),
    );

    await deleteAccount(USER_ID);
    expect(ops()).toContain("deleteUser");
  });

  it("cancels a subscription Stripe has but we have no row for yet", async () => {
    state.subscriptions = [
      { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_old", status: "canceled" },
    ];
    state.stripeSubs = [{ id: "sub_new_unsynced", status: "active" }];

    const res = await deleteAccount(USER_ID);
    expect(state.cancel).toHaveBeenCalledWith("sub_new_unsynced");
    expect(res.canceledSubscriptions).toBe(1);
  });

  it("finds a brand-new subscription with no row through Stripe search", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    state.searchSubs = [{ id: "sub_just_bought", status: "active" }];

    await deleteAccount(USER_ID);
    expect(state.cancel).toHaveBeenCalledWith("sub_just_bought");
  });

  it("refuses (retention) when anything is still live, before touching data", async () => {
    state.subscriptions = [
      { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_old", status: "canceled" },
    ];
    state.stripeSubs = [{ id: "sub_new", status: "active" }];

    await expect(deleteAccount(USER_ID, { refuseIfLive: true })).rejects.toMatchObject({
      step: "stripe",
    });
    expect(state.cancel).not.toHaveBeenCalled();
    expect(ops()).toEqual([]);
  });

  it("keeps the rows and the user when a file can't be removed", async () => {
    state.files = { receipts: { [USER_ID]: [{ name: "a.jpg", id: "1" }] } };
    state.removeError = { message: "boom" };

    await expect(deleteAccount(USER_ID)).rejects.toBeInstanceOf(AccountDeletionError);
    expect(ops()).toEqual(["remove:receipts"]);
  });

  it("refuses an id that isn't a UUID (it becomes a storage prefix)", async () => {
    await expect(deleteAccount("../other")).rejects.toMatchObject({ step: "auth" });
    expect(ops()).toEqual([]);
  });
});

describe("isFreshSignIn", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  it("accepts a sign-in in the last 30 minutes only", () => {
    expect(isFreshSignIn("2026-10-15T11:45:00Z", now)).toBe(true);
    expect(isFreshSignIn("2026-10-15T11:20:00Z", now)).toBe(false);
    expect(isFreshSignIn(null, now)).toBe(false);
    expect(isFreshSignIn("garbage", now)).toBe(false);
  });
});

describe("sessionAuthTime", () => {
  it("takes the latest amr timestamp, or null without one", () => {
    expect(
      sessionAuthTime({
        amr: [
          { method: "password", timestamp: 1_790_000_000 },
          { method: "otp", timestamp: 1_790_000_600 },
        ],
      }),
    ).toBe(new Date(1_790_000_600 * 1000).toISOString());
    expect(sessionAuthTime({ amr: ["pwd"] })).toBeNull();
    expect(sessionAuthTime(null)).toBeNull();
  });
});
