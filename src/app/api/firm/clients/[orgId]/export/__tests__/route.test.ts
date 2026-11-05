// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireFirmMember: vi.fn(),
  requireFirmClientAccess: vi.fn(),
  rateLimit: vi.fn(),
  buildExport: vi.fn(),
}));

vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: mocks.requireFirmMember,
  requireFirmClientAccess: mocks.requireFirmClientAccess,
}));
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/export/build-export", async (orig) => ({
  ...(await orig<typeof import("@/lib/export/build-export")>()),
  buildExport: mocks.buildExport,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { FirmAuthError } from "@/lib/require-firm";
import { POST } from "@/app/api/firm/clients/[orgId]/export/route";

const STAFF = "44444444-4444-4444-8444-444444444444";
const ORG = "33333333-3333-4333-8333-333333333333";
const CTX = { user: { id: STAFF }, memberId: "fm-1", firmId: "firm-1", firmName: "Byrån AB", role: "staff" };

const post = (body: unknown, orgId = ORG) =>
  POST(
    new NextRequest(`https://app.unreceipt.com/api/firm/clients/${orgId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orgId }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFirmMember.mockResolvedValue(CTX);
  mocks.requireFirmClientAccess.mockResolvedValue({ firmClientId: "fc-1", organizationId: ORG, clientName: "Acme AB" });
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.buildExport.mockResolvedValue({
    receiptCount: 2,
    missing: 0,
    parts: [{ path: "x", filename: "unreceipt-2026-10.zip", url: "https://signed", bytes: 10 }],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/firm/clients/[orgId]/export", () => {
  it("needs a firm member", async () => {
    mocks.requireFirmMember.mockRejectedValueOnce(new FirmAuthError("not_member"));
    expect((await post({ period: "2026-10" })).status).toBe(403);
    expect(mocks.buildExport).not.toHaveBeenCalled();
  });

  it("answers 404 for a client the firm isn't linked to, before any work", async () => {
    mocks.requireFirmClientAccess.mockRejectedValueOnce(new FirmAuthError("no_access"));
    expect((await post({ period: "2026-10" })).status).toBe(404);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.buildExport).not.toHaveBeenCalled();
  });

  it("rejects a bad period", async () => {
    expect((await post({ period: "last month" })).status).toBe(400);
  });

  it("exports the client's unexported receipts, stamped, scoped by the checked organisation", async () => {
    const res = await post({ period: "2026-10" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      receiptCount: 2,
      missing: 0,
      parts: [{ filename: "unreceipt-2026-10.zip", url: "https://signed", bytes: 10 }],
    });
    expect(mocks.requireFirmClientAccess).toHaveBeenCalledWith("firm-1", ORG);
    expect(mocks.buildExport).toHaveBeenCalledWith({
      scope: { kind: "organization", organizationId: ORG },
      actorUserId: STAFF,
      period: { kind: "month", month: "2026-10" },
      unexportedOnly: true,
      markExported: true,
    });
    expect(mocks.rateLimit).toHaveBeenCalledWith("firmExport", STAFF);
  });

  it("can re-export everything without stamping", async () => {
    await post({ period: "2026-10", unexportedOnly: false, markExported: false });
    expect(mocks.buildExport).toHaveBeenCalledWith(
      expect.objectContaining({ unexportedOnly: false, markExported: false })
    );
  });

  it("is rate limited and hides internal errors", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30 });
    expect((await post({ period: "2026-10" })).status).toBe(429);
    mocks.buildExport.mockRejectedValueOnce(new Error("export upload failed"));
    const res = await post({ period: "2026-10" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/upload/);
  });
});
