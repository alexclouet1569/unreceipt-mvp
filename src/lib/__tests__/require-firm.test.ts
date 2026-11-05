import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  memberRead: vi.fn(),
  claim: vi.fn(),
  clientRead: vi.fn(),
  updatePayload: null as unknown,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mocks.getServerUser,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (col: string, v: unknown) => {
            filters[col] = v;
            return chain;
          },
          maybeSingle: () =>
            table === "firm_members" ? mocks.memberRead(filters) : mocks.clientRead(filters),
        };
        return chain;
      },
      update: (payload: unknown) => {
        mocks.updatePayload = payload;
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: () => ({ maybeSingle: () => mocks.claim() }),
        };
        return chain;
      },
    }),
  }),
}));

import {
  FirmAuthError,
  firmAuthResponse,
  getFirmMembership,
  isUuid,
  requireFirmClientAccess,
  requireFirmMember,
  requireFirmMemberPage,
} from "@/lib/require-firm";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "Eva@Byran.se",
  email_confirmed_at: "2026-11-01T00:00:00Z",
};
const ORG = "22222222-2222-4222-8222-222222222222";
const MEMBER_ROW = { id: "fm-1", firm_id: "firm-1", role: "staff", firms: { name: "Byrån AB" } };

beforeEach(() => {
  mocks.getServerUser.mockReset();
  mocks.memberRead.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.claim.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.clientRead.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.updatePayload = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requireFirmMember", () => {
  it("throws no_user when signed out", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    await expect(requireFirmMember()).rejects.toMatchObject({ reason: "no_user" });
  });

  it("returns the membership with the firm name", async () => {
    mocks.getServerUser.mockResolvedValue(USER);
    mocks.memberRead.mockResolvedValue({ data: MEMBER_ROW, error: null });
    const ctx = await requireFirmMember();
    expect(ctx).toMatchObject({
      user: USER,
      memberId: "fm-1",
      firmId: "firm-1",
      firmName: "Byrån AB",
      role: "staff",
    });
    expect(mocks.memberRead).toHaveBeenCalledWith({ user_id: USER.id });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("claims a pending row for the confirmed, lowercased email", async () => {
    mocks.getServerUser.mockResolvedValue(USER);
    mocks.claim.mockResolvedValue({ data: { ...MEMBER_ROW, role: "admin" }, error: null });
    const ctx = await requireFirmMember();
    expect(ctx.role).toBe("admin");
    expect(mocks.updatePayload).toMatchObject({ user_id: USER.id });
    expect((mocks.updatePayload as { claimed_at: string }).claimed_at).toMatch(/^\d{4}-/);
  });

  it("never claims for an unconfirmed address", async () => {
    mocks.getServerUser.mockResolvedValue({ ...USER, email_confirmed_at: null });
    await expect(requireFirmMember()).rejects.toMatchObject({ reason: "not_member" });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("throws not_member when nothing matches", async () => {
    mocks.getServerUser.mockResolvedValue(USER);
    await expect(requireFirmMember()).rejects.toMatchObject({ reason: "not_member" });
  });
});

describe("requireFirmMemberPage", () => {
  it("sends signed-out users to login and back to /firm", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    await expect(requireFirmMemberPage()).rejects.toThrow("NEXT_REDIRECT:/app/login?next=/firm");
  });

  it("sends non-members to /app", async () => {
    mocks.getServerUser.mockResolvedValue(USER);
    await expect(requireFirmMemberPage()).rejects.toThrow("NEXT_REDIRECT:/app");
  });
});

describe("getFirmMembership", () => {
  it("is null on a read error", async () => {
    mocks.memberRead.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getFirmMembership(USER.id)).toBeNull();
  });
});

describe("requireFirmClientAccess", () => {
  it("rejects a non-UUID without touching the database", async () => {
    await expect(requireFirmClientAccess("firm-1", "../etc")).rejects.toMatchObject({
      reason: "no_access",
    });
    expect(mocks.clientRead).not.toHaveBeenCalled();
  });

  it("requires an active link for this firm", async () => {
    mocks.clientRead.mockResolvedValue({
      data: { id: "fc-1", organization_id: ORG, client_name: "Acme AB" },
      error: null,
    });
    const access = await requireFirmClientAccess("firm-1", ORG);
    expect(access).toEqual({ firmClientId: "fc-1", organizationId: ORG, clientName: "Acme AB" });
    expect(mocks.clientRead).toHaveBeenCalledWith({
      firm_id: "firm-1",
      organization_id: ORG,
      status: "active",
    });
  });

  it("throws no_access when the client belongs to another firm", async () => {
    await expect(requireFirmClientAccess("firm-1", ORG)).rejects.toMatchObject({
      reason: "no_access",
    });
  });
});

describe("firmAuthResponse", () => {
  it("maps reasons to 401 / 403 / 404", () => {
    expect(firmAuthResponse(new FirmAuthError("no_user")).status).toBe(401);
    expect(firmAuthResponse(new FirmAuthError("not_member")).status).toBe(403);
    expect(firmAuthResponse(new FirmAuthError("no_access")).status).toBe(404);
  });
});

describe("isUuid", () => {
  it("accepts v4 ids and rejects the rest", () => {
    expect(isUuid(ORG)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
