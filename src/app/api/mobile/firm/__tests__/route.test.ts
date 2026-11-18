// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  member: vi.fn(),
  access: vi.fn(),
  limit: vi.fn(),
  clients: vi.fn(),
  stats: vi.fn(),
  monthReceipts: vi.fn(),
  reminders: vi.fn(),
  join: vi.fn(),
}));

vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: () => m.member(),
  requireFirmClientAccess: (...a: unknown[]) => m.access(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => m.limit(...a),
  rateLimitedResponse: () => Response.json({ error: "rate_limited" }, { status: 429 }),
}));
vi.mock("@/lib/firm/portal-load", () => ({
  loadFirmClients: (...a: unknown[]) => m.clients(...a),
  loadClientStats: (...a: unknown[]) => m.stats(...a),
  loadClientMonthReceipts: (...a: unknown[]) => m.monthReceipts(...a),
  loadReminderState: (...a: unknown[]) => m.reminders(...a),
}));
vi.mock("@/lib/firm/join-link", async (orig) => ({
  ...(await orig<typeof import("@/lib/firm/join-link")>()),
  ensureJoinCode: (...a: unknown[]) => m.join(...a),
}));
vi.mock("@/lib/firm/join-qr", () => ({ joinQrDataUrl: async () => "data:image/png;base64,QR" }));
vi.mock("@/lib/fx", () => ({ ensureHomeAmounts: async (rows: unknown[]) => rows, homeCurrencyOf: async () => "SEK" }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/app-url", () => ({ absoluteAppUrl: (p: string) => `https://app.unreceipt.com${p}` }));

import { FirmAuthError } from "@/lib/require-firm";
import { GET as firmHome } from "../route";
import { GET as clientMonth } from "../clients/[orgId]/route";

const CTX = { user: { id: "u-1" }, firmId: "firm-1", firmName: "Byrån AB", role: "staff", memberId: "m-1" };
const ORG = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  m.member.mockResolvedValue(CTX);
  m.limit.mockResolvedValue({ ok: true });
  m.clients.mockResolvedValue({
    active: [{ id: "fc-1", client_name: "Hallonbergen Bygg AB", client_org_number: "559210-4471", organization_id: ORG }],
    pending: [{ id: "fc-2", client_name: "Nordljus", invited_email: "maja@nordljus.se", created_at: "2026-11-10T00:00:00Z", invite_expires_at: null, expired: false }],
  });
  m.stats.mockResolvedValue(new Map([[ORG, { total: 7, reviewNeeded: 2, ready: 4, exported: 1, newThisWeek: 3, lastReceiptAt: "2026-11-14T00:00:00Z" }]]));
  m.join.mockResolvedValue({ code: "AbCdEfGhIjKlMnOpQrStUv", off: false });
  m.access.mockResolvedValue({ organizationId: ORG, firmClientId: "fc-1", clientName: "Hallonbergen Bygg AB" });
  m.monthReceipts.mockResolvedValue([
    { id: "r1", user_id: "owner", status: "verified", merchant_name: "Byggmax", total: 100, currency: "SEK", purchased_at: "2026-11-03T12:00:00Z", receipt_date: null, created_at: "2026-11-03T12:00:00Z", source: "paper", notes: null },
  ]);
  m.reminders.mockResolvedValue({ weekly: true, clientOptedOut: false, lastSentAt: null });
});

describe("GET /api/mobile/firm", () => {
  it("lists the session firm's clients with counts, waiting invites and the join link", async () => {
    const res = await firmHome(new Request("https://app.unreceipt.com/api/mobile/firm?month=2026-11"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      firmName: "Byrån AB",
      role: "staff",
      month: "2026-11",
      clients: [{ organizationId: ORG, name: "Hallonbergen Bygg AB", total: 7, reviewNeeded: 2, newThisWeek: 3 }],
      pending: [{ id: "fc-2", name: "Nordljus", email: "maja@nordljus.se", expired: false }],
      joinLink: { url: "https://app.unreceipt.com/app/connect/AbCdEfGhIjKlMnOpQrStUv", qr: "data:image/png;base64,QR" },
    });
    // The ready Swedish email for clients, with the same link and the client guide.
    expect(body.joinLink.recommend.subject).toBe("Så skickar du kvitton till oss med UnReceipt");
    expect(body.joinLink.recommend.body).toContain("Öppna vår länk: https://app.unreceipt.com/app/connect/AbCdEfGhIjKlMnOpQrStUv");
    expect(body.joinLink.recommend.body).toContain("/guides/UnReceipt-Get-started-companies.pdf");
    expect(m.clients).toHaveBeenCalledWith("firm-1");
    expect(m.limit).toHaveBeenCalledWith("analytics", "u-1");
  });

  it("refuses someone who isn't a firm member", async () => {
    m.member.mockRejectedValue(new FirmAuthError("not_member"));
    expect((await firmHome(new Request("https://app.unreceipt.com/api/mobile/firm"))).status).toBe(403);
    expect(m.clients).not.toHaveBeenCalled();
  });
});

describe("GET /api/mobile/firm/clients/[orgId]", () => {
  const call = (org = ORG) =>
    clientMonth(new Request(`https://app.unreceipt.com/api/mobile/firm/clients/${org}?month=2026-11`), {
      params: Promise.resolve({ orgId: org }),
    });

  it("shows a linked client's month, scoped by the organisation the access check returned", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ organizationId: ORG, clientName: "Hallonbergen Bygg AB", month: "2026-11" });
    expect(body.receipts[0]).toMatchObject({ id: "r1", merchant: "Byggmax" });
    expect(m.access).toHaveBeenCalledWith("firm-1", ORG);
    expect(m.monthReceipts).toHaveBeenCalledWith(ORG, "2026-11");
  });

  it("answers 404 for a client the firm isn't linked to", async () => {
    m.access.mockRejectedValue(new FirmAuthError("no_access"));
    expect((await call()).status).toBe(404);
    expect(m.monthReceipts).not.toHaveBeenCalled();
  });
});
