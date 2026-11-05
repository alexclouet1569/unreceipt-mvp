import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  receipt: { data: null as unknown, error: null as unknown },
  member: { data: null as unknown, error: null as unknown },
  link: { data: null as unknown, error: null as unknown },
  linkFilters: {} as Record<string, unknown>,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (c: string, v: unknown) => {
            filters[c] = v;
            return chain;
          },
          maybeSingle: async () => {
            if (table === "receipts") return state.receipt;
            if (table === "firm_members") return state.member;
            state.linkFilters = filters;
            return state.link;
          },
        };
        return chain;
      },
    }),
  }),
}));

import { loadReceiptForActor, ReceiptAccessError } from "@/lib/receipts/access";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";
const RECEIPT = { id: "r-1", user_id: OWNER, organization_id: ORG };

beforeEach(() => {
  state.receipt = { data: RECEIPT, error: null };
  state.member = { data: null, error: null };
  state.link = { data: null, error: null };
  state.linkFilters = {};
});

describe("loadReceiptForActor", () => {
  it("returns the owner's receipt as owner without any firm lookup", async () => {
    expect(await loadReceiptForActor({ id: OWNER }, "r-1")).toEqual({ receipt: RECEIPT, via: "owner" });
    expect(state.linkFilters).toEqual({});
  });

  it("returns null for a missing row and throws on a database error", async () => {
    state.receipt = { data: null, error: null };
    expect(await loadReceiptForActor({ id: OWNER }, "r-1")).toBeNull();
    state.receipt = { data: null, error: { message: "boom" } };
    await expect(loadReceiptForActor({ id: OWNER }, "r-1")).rejects.toBeInstanceOf(ReceiptAccessError);
  });

  it("lets staff of the firm actively linked to the receipt's company see it", async () => {
    state.member = { data: { firm_id: "firm-1" }, error: null };
    state.link = { data: { id: "fc-1" }, error: null };
    expect(await loadReceiptForActor({ id: STAFF }, "r-1")).toEqual({
      receipt: RECEIPT,
      via: "firm",
      firmId: "firm-1",
    });
    expect(state.linkFilters).toEqual({ firm_id: "firm-1", organization_id: ORG, status: "active" });
  });

  it("hides it from a non-member, from another firm, and when the receipt has no company", async () => {
    expect(await loadReceiptForActor({ id: STAFF }, "r-1")).toBeNull();
    state.member = { data: { firm_id: "firm-2" }, error: null };
    expect(await loadReceiptForActor({ id: STAFF }, "r-1")).toBeNull();
    state.receipt = { data: { ...RECEIPT, organization_id: null }, error: null };
    state.link = { data: { id: "fc-1" }, error: null };
    expect(await loadReceiptForActor({ id: STAFF }, "r-1")).toBeNull();
  });
});
