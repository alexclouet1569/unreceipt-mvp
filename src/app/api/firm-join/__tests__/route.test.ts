// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
  membership: null as null | { firmId: string },
  seat: null as null | { firmName: string },
  claim: vi.fn(),
  decline: vi.fn(),
  mintOrg: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/require-firm", () => ({
  getFirmMembership: async () => mocks.membership,
  findPendingFirmSeat: async () => mocks.seat,
  claimPendingFirmSeat: mocks.claim,
  declinePendingFirmSeats: mocks.decline,
}));
vi.mock("@/lib/organizations", () => ({ getOrCreateDefaultOrganization: mocks.mintOrg }));

import { POST } from "@/app/api/firm-join/route";

const USER = { id: "u1", email: "eva@byran.se", email_confirmed_at: "2026-11-01T00:00:00Z" };

const call = (body: unknown, origin = "https://app.unreceipt.com") =>
  POST(
    new NextRequest("https://app.unreceipt.com/api/firm-join", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com", origin },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.user = USER;
  mocks.membership = null;
  mocks.seat = { firmName: "Byrån AB" };
  mocks.claim.mockReset().mockResolvedValue({ firmId: "f1", memberId: "m1", firmName: "Byrån AB", role: "staff" });
  mocks.decline.mockReset().mockResolvedValue(true);
  mocks.mintOrg.mockReset().mockResolvedValue("org-1");
});

describe("POST /api/firm-join", () => {
  it("claims the waiting seat only on an explicit join", async () => {
    const res = await call({ action: "join" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/firm" });
    expect(mocks.claim).toHaveBeenCalledWith(USER);
    expect(mocks.mintOrg).not.toHaveBeenCalled();
  });

  it("'Not me' removes the waiting seats and gives the user their own company", async () => {
    const res = await call({ action: "decline" });
    expect(await res.json()).toEqual({ ok: true, redirect: "/app" });
    expect(mocks.decline).toHaveBeenCalledWith(USER);
    expect(mocks.mintOrg).toHaveBeenCalledWith("u1");
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("refuses a cross-site POST, so another page can't join someone to a firm", async () => {
    const res = await call({ action: "join" }, "https://evil.example");
    expect(res.status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    mocks.user = null;
    expect((await call({ action: "join" })).status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("answers 404 when no seat waits for this address", async () => {
    mocks.seat = null;
    expect((await call({ action: "join" })).status).toBe(404);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("does nothing for someone already in a firm", async () => {
    mocks.membership = { firmId: "f1" };
    expect(await (await call({ action: "decline" })).json()).toEqual({ ok: true, redirect: "/firm" });
    expect(mocks.decline).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    expect((await call({ action: "maybe" })).status).toBe(400);
  });
});
