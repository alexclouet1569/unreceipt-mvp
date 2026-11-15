// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ member: vi.fn(), access: vi.fn(), limit: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: () => m.member(),
  requireFirmClientAccess: (...a: unknown[]) => m.access(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => m.limit(...a),
  rateLimitedResponse: () => Response.json({ error: "rate_limited" }, { status: 429 }),
}));
vi.mock("@/lib/reminders/now", () => ({ sendReminderNow: (...a: unknown[]) => m.send(...a) }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { FirmAuthError } from "@/lib/require-firm";
import { POST } from "../route";

const ORG = "33333333-3333-4333-8333-333333333333";
const call = (origin = "https://app.unreceipt.com") =>
  POST(
    new NextRequest(`https://app.unreceipt.com/api/firm/clients/${ORG}/remind`, {
      method: "POST",
      headers: { origin, host: "app.unreceipt.com" },
    }),
    { params: Promise.resolve({ orgId: ORG }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.member.mockResolvedValue({ user: { id: "u-1" }, firmId: "firm-1", firmName: "Byrån AB", role: "staff" });
  m.access.mockResolvedValue({ organizationId: ORG, firmClientId: "fc-1", clientName: "Hallonbergen Bygg AB" });
  m.limit.mockResolvedValue({ ok: true });
  m.send.mockResolvedValue({ ok: true, recipients: 1 });
});

describe("POST /api/firm/clients/[orgId]/remind", () => {
  it("sends for a linked client, with the session firm, rate limited per company", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.send).toHaveBeenCalledWith({
      firmId: "firm-1",
      firmName: "Byrån AB",
      firmClientId: "fc-1",
      organizationId: ORG,
      clientName: "Hallonbergen Bygg AB",
    });
    expect(m.limit).toHaveBeenCalledWith("clientRemindNow", ORG);
  });

  it("refuses another site, a non-member and an unlinked client", async () => {
    expect((await call("https://evil.example")).status).toBe(403);
    m.member.mockRejectedValueOnce(new FirmAuthError("not_member"));
    expect((await call()).status).toBe(403);
    m.access.mockRejectedValueOnce(new FirmAuthError("no_access"));
    expect((await call()).status).toBe(404);
    expect(m.send).not.toHaveBeenCalled();
  });

  it("explains why nothing was sent", async () => {
    m.send.mockResolvedValue({ ok: false, reason: "opted_out" });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("opted_out");
  });

  it("is rate limited", async () => {
    m.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    expect((await call()).status).toBe(429);
    expect(m.send).not.toHaveBeenCalled();
  });
});
