// @vitest-environment node
// deleteAccount() releases every connected mailbox (stop watch, revoke the
// grant, parked grants too) right after Stripe and before any file, receipt
// or the user goes, and a failure there never stops the deletion. The
// teardown itself is tested in src/lib/mailboxes/__tests__/lifecycle.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  disconnect: vi.fn(),
}));

vi.mock("@/lib/mailboxes/teardown", () => ({ disconnectAllMailboxes: state.disconnect }));
vi.mock("@/lib/firm/link-emails", () => ({ sendFirmClosedNotices: async () => ({ sent: 0, failed: 0 }) }));
vi.mock("@/lib/firm/account-exit", () => ({
  planFirmExit: async () => ({ kind: "none" }),
  applyFirmExit: async () => {},
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({}) }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      delete: () => ({
        eq: async () => {
          state.calls.push(`delete:${table}`);
          return { error: null };
        },
        like: async () => ({ error: null }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        list: async () => {
          state.calls.push(`list:${bucket}`);
          return { data: [], error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
    auth: {
      admin: {
        deleteUser: async () => {
          state.calls.push("deleteUser");
          return { error: null };
        },
      },
    },
  }),
}));

import { deleteAccount } from "@/lib/account-deletion";

beforeEach(() => {
  state.calls = [];
  delete process.env.STRIPE_SECRET_KEY;
  state.disconnect.mockReset().mockImplementation(async (userId: string) => {
    state.calls.push(`mailboxes:${userId}`);
    return 2;
  });
});

describe("deleteAccount and connected mailboxes", () => {
  const sweep = ["list:receipts", "list:receipt-originals", "list:exports"];

  it("disconnects every mailbox before the files, the receipts and the user, then sweeps again", async () => {
    await deleteAccount(USER_ID);
    expect(state.disconnect).toHaveBeenCalledWith(USER_ID, expect.anything());
    expect(state.calls).toEqual([`mailboxes:${USER_ID}`, ...sweep, "delete:receipts", "deleteUser", ...sweep]);
  });

  it("still deletes the account when disconnecting fails", async () => {
    state.disconnect.mockRejectedValue(new Error("provider down"));
    await expect(deleteAccount(USER_ID)).resolves.toBeTruthy();
    expect(state.calls).toEqual([...sweep, "delete:receipts", "deleteUser", ...sweep]);
  });
});
