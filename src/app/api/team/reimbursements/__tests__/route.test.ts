// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  markReimbursed: vi.fn(),
}));

vi.mock("@/lib/team/http", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/team/http")>();
  return { ...real, teamGuard: async () => ({ ok: true, user: { id: "b0000000-0000-4000-8000-000000000001" } }) };
});
vi.mock("@/lib/team/decisions", () => ({
  loadReimbursements: vi.fn(),
  markReimbursed: mocks.markReimbursed,
}));

import { POST } from "../route";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const SEEN = "2026-11-17T12:00:00.123456+00:00";

const post = (body: unknown) =>
  POST(
    new NextRequest("https://app.unreceipt.com/api/team/reimbursements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.markReimbursed.mockReset();
  mocks.markReimbursed.mockResolvedValue({ ok: true, value: { count: 2 } });
});

describe("POST /api/team/reimbursements", () => {
  it("passes each receipt with the updated_at the list showed", async () => {
    const res = await post({ receipts: [{ id: R1, updatedAt: SEEN }, { id: R2, updatedAt: null }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(mocks.markReimbursed).toHaveBeenCalledWith("b0000000-0000-4000-8000-000000000001", [
      { id: R1, updatedAt: SEEN },
      { id: R2, updatedAt: null },
    ]);
  });

  it("refuses the bare ids of before: they would mark whatever the amounts are now", async () => {
    expect((await post({ receiptIds: [R1] })).status).toBe(400);
    expect(mocks.markReimbursed).not.toHaveBeenCalled();
  });

  it("refuses a receipt without its updated_at, a malformed one, and duplicates", async () => {
    expect((await post({ receipts: [{ id: R1 }] })).status).toBe(400);
    expect((await post({ receipts: [{ id: R1, updatedAt: "yesterday" }] })).status).toBe(400);
    expect((await post({ receipts: [{ id: R1, updatedAt: SEEN }, { id: R1, updatedAt: SEEN }] })).status).toBe(400);
    expect((await post({ receipts: [] })).status).toBe(400);
    expect(mocks.markReimbursed).not.toHaveBeenCalled();
  });

  it("answers 409 changed when something moved since the list was read", async () => {
    mocks.markReimbursed.mockResolvedValue({ ok: false, status: 409, error: "changed" });
    const res = await post({ receipts: [{ id: R1, updatedAt: SEEN }] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "changed" });
  });
});
