// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
  active: { data: null as unknown, error: null as unknown },
  inserted: [] as unknown[],
  updates: [] as unknown[],
  send: vi.fn(),
  limited: { ok: true } as { ok: boolean; retryAfterSeconds?: number },
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/organizations", () => ({ getOrCreateDefaultOrganization: async () => "org-1" }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => mocks.limited,
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.send, founderReplyTo: () => undefined }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () =>
            table === "organizations" ? { data: { name: "Nordljus Design AB", org_number: "559501-3378" }, error: null } : mocks.active,
        };
        return chain;
      },
      update: (row: unknown) => {
        mocks.updates.push(row);
        const chain = { eq: () => chain, then: (r: (v: unknown) => void) => r({ error: null }) };
        return chain;
      },
      insert: (row: unknown) => {
        mocks.inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "new-row" }, error: null }) }) };
      },
    }),
  }),
}));

import { POST } from "@/app/api/accountant/invite/route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "maja@nordljus.se", email_confirmed_at: "2026-10-01T00:00:00Z" };
const call = (body: unknown) =>
  POST(
    new NextRequest("https://app.unreceipt.com/api/accountant/invite", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.user = USER;
  mocks.active = { data: null, error: null };
  mocks.inserted = [];
  mocks.updates = [];
  mocks.limited = { ok: true };
  mocks.send.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/accountant/invite", () => {
  it("needs a signed-in, confirmed account", async () => {
    mocks.user = null;
    expect((await call({ email: "erik@byra.se" })).status).toBe(401);
    mocks.user = { ...USER, email_confirmed_at: null };
    expect((await call({ email: "erik@byra.se" })).status).toBe(403);
  });

  it("refuses a bad address and the user's own address", async () => {
    expect((await call({ email: "nope" })).status).toBe(400);
    expect((await call({ email: "Maja@Nordljus.se" })).status).toBe(400);
    // The same Gmail mailbox spelled differently is still the user's own.
    mocks.user = { ...USER, email: "Maja.Lind@gmail.com" };
    expect((await call({ email: "majalind+x@googlemail.com" })).status).toBe(400);
  });

  it("refuses while a firm is already connected", async () => {
    mocks.active = { data: { id: "link" }, error: null };
    expect((await call({ email: "erik@byra.se" })).status).toBe(409);
    expect(mocks.inserted).toEqual([]);
  });

  it("is rate-limited", async () => {
    mocks.limited = { ok: false, retryAfterSeconds: 60 };
    expect((await call({ email: "erik@byra.se" })).status).toBe(429);
  });

  it("replaces the previous request, stores a client-sent invite and emails the accountant", async () => {
    const res = await call({ email: " Erik@Byra.se " });
    expect(res.status).toBe(201);
    expect(mocks.updates[0]).toMatchObject({ status: "revoked", invite_token_hash: null });
    expect(mocks.inserted[0]).toMatchObject({
      direction: "client",
      firm_id: null,
      organization_id: "org-1",
      status: "invited",
      client_name: "Nordljus Design AB",
      invited_email: "erik@byra.se",
      invited_by: USER.id,
    });
    const row = mocks.inserted[0] as { invite_token_hash: string };
    expect(row.invite_token_hash).toMatch(/^[0-9a-f]{64}$/);
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.to).toBe("erik@byra.se");
    expect(mail.tag).toBe("client_request");
    expect(mail.text).toContain("/app/firm-request?token=");
  });
});
