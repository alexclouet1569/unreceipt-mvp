// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireFirmMember: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  limit: vi.fn(),
  filters: [] as [string, unknown][],
}));

vi.mock("@/lib/require-firm", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-firm")>()),
  requireFirmMember: mocks.requireFirmMember,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: unknown) => ({
        select: () => ({ single: () => mocks.insert(row) }),
      }),
      update: (row: unknown) => {
        const chain = {
          eq: (c: string, v: unknown) => {
            mocks.filters.push([c, v]);
            return chain;
          },
          neq: (c: string, v: unknown) => {
            mocks.filters.push([`!${c}`, v]);
            return chain;
          },
          select: () => ({ maybeSingle: () => mocks.update(row) }),
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.send, founderReplyTo: () => "founder@unreceipt.com" }));
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.limit,
}));
vi.mock("@/lib/app-url", () => ({
  appUrl: (p: string) => `https://app.unreceipt.com${p}`,
  absoluteAppUrl: (p: string) => `https://app.unreceipt.com${p}`,
}));

import { FirmAuthError } from "@/lib/require-firm";
import { POST } from "@/app/api/firm/clients/route";
import { DELETE } from "@/app/api/firm/links/[id]/route";

const CTX = {
  user: { id: "11111111-1111-4111-8111-111111111111", email: "eva@byran.se" },
  memberId: "fm-1",
  firmId: "33333333-3333-4333-8333-333333333333",
  firmName: "Byrån AB",
  role: "staff",
};
const INVITE_ID = "44444444-4444-4444-8444-444444444444";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("https://app.unreceipt.com/api/firm/clients", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com", ...headers },
      body: JSON.stringify(body),
    })
  );

const del = (id: string) =>
  DELETE(
    new NextRequest(`https://app.unreceipt.com/api/firm/links/${id}`, {
      method: "DELETE",
      headers: { host: "app.unreceipt.com" },
    }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  mocks.requireFirmMember.mockReset().mockResolvedValue(CTX);
  mocks.insert.mockReset().mockResolvedValue({ data: { id: INVITE_ID }, error: null });
  mocks.update.mockReset().mockResolvedValue({ data: { id: INVITE_ID }, error: null });
  mocks.send.mockReset().mockResolvedValue({ ok: true, id: "em-1" });
  mocks.limit.mockReset().mockResolvedValue({ ok: true });
  mocks.filters = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/firm/clients", () => {
  it("refuses a cross-site origin", async () => {
    const res = await post({}, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(mocks.requireFirmMember).not.toHaveBeenCalled();
  });

  it("maps firm auth errors to status codes", async () => {
    mocks.requireFirmMember.mockRejectedValue(new FirmAuthError("not_member"));
    expect((await post({ client_name: "Acme", email: "a@b.se" })).status).toBe(403);
    mocks.requireFirmMember.mockRejectedValue(new FirmAuthError("no_user"));
    expect((await post({ client_name: "Acme", email: "a@b.se" })).status).toBe(401);
  });

  it("validates the body", async () => {
    expect((await post({ client_name: "", email: "a@b.se" })).status).toBe(400);
    expect((await post({ client_name: "Acme", email: "nope" })).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates the invite for the session firm and emails the link", async () => {
    const res = await post({ client_name: " Acme AB ", client_org_number: "556677-8899", email: "Anna@Acme.se" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: INVITE_ID, emailed: true });

    const row = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      firm_id: CTX.firmId,
      status: "invited",
      client_name: "Acme AB",
      client_org_number: "556677-8899",
      invited_email: "anna@acme.se",
      invited_by: CTX.user.id,
    });
    expect(row.invite_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof row.invite_expires_at).toBe("string");

    const email = mocks.send.mock.calls[0][0] as { to: string; tag: string; text: string; html: string };
    expect(email.to).toBe("anna@acme.se");
    expect(email.tag).toBe("firm_invite");
    expect(email.text).toContain("https://app.unreceipt.com/app/accountant/accept?token=");
    // The link carries the token, never its hash.
    expect(email.text).not.toContain(row.invite_token_hash as string);
    expect(mocks.limit).toHaveBeenCalledWith("firmInvite", CTX.user.id);
  });

  it("keeps the invite when the email can't be sent", async () => {
    mocks.send.mockResolvedValue({ ok: false, reason: "rejected" });
    const res = await post({ client_name: "Acme", email: "anna@acme.se" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ emailed: false });
  });

  it("is rate limited", async () => {
    mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    expect((await post({ client_name: "Acme", email: "anna@acme.se" })).status).toBe(429);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/firm/links/[id]", () => {
  it("revokes a row of the session firm only", async () => {
    const res = await del(INVITE_ID);
    expect(res.status).toBe(200);
    expect(mocks.filters).toEqual([
      ["id", INVITE_ID],
      ["firm_id", CTX.firmId],
      ["!status", "revoked"],
    ]);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ status: "revoked", invite_token_hash: null });
  });

  it("answers 404 for a bad id or another firm's row", async () => {
    expect((await del("nope")).status).toBe(404);
    mocks.update.mockResolvedValue({ data: null, error: null });
    expect((await del(INVITE_ID)).status).toBe(404);
  });
});
