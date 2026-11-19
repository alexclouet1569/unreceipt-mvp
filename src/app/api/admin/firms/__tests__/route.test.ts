// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  existing: null as unknown,
  firmInsert: vi.fn(),
  memberInsert: vi.fn(),
  firmDeletes: [] as unknown[],
  sendEmail: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/require-admin", async (orig) => ({
  ...(await orig<typeof import("@/lib/require-admin")>()),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail, founderReplyTo: () => "founder@unreceipt.com" }));
vi.mock("@/lib/app-url", () => ({
  appUrl: (p: string) => `https://app.unreceipt.com${p}`,
  absoluteAppUrl: (p: string) => `https://app.unreceipt.com${p}`,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    rpc: (name: string, args: unknown) => Promise.resolve(mocks.rpc(name, args)),
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (_c: string, v: unknown) => (table === "firms" ? (mocks.firmDeletes.push(v), Promise.resolve({ error: null })) : chain),
        limit: () => chain,
        maybeSingle: async () => ({ data: mocks.existing, error: null }),
        insert: (row: unknown) => {
          if (table === "firms") {
            const res = mocks.firmInsert(row);
            return { select: () => ({ single: async () => res }) };
          }
          return Promise.resolve(mocks.memberInsert(row));
        },
        delete: () => chain,
      };
      return chain;
    },
  }),
}));

import { AdminAuthError } from "@/lib/require-admin";
import { POST } from "@/app/api/admin/firms/route";

const post = (body: unknown) =>
  POST(
    new NextRequest("https://app.unreceipt.com/api/admin/firms", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.unreceipt.com" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: "admin" });
  mocks.existing = null;
  mocks.firmInsert.mockReset().mockReturnValue({ data: { id: "f-new" }, error: null });
  mocks.memberInsert.mockReset().mockReturnValue({ error: null });
  mocks.firmDeletes = [];
  mocks.rpc.mockReset().mockReturnValue({ data: false, error: null });
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true, id: "e" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/admin/firms", () => {
  it("refuses an address that already has a company account (one account, one role)", async () => {
    mocks.rpc.mockReturnValue({ data: true, error: null });
    const res = await post({ name: "Bergström Redovisning AB", email: "Anna@Bergstrom.se" });
    expect(res.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledWith("company_account_for_address", { addr: "anna@bergstrom.se" });
    expect(mocks.firmInsert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("creates nothing when it can't tell whether the address has a company account", async () => {
    mocks.rpc.mockReturnValue({ data: null, error: { code: "XX000" } });
    const res = await post({ name: "Bergström Redovisning AB", email: "anna@bergstrom.se" });
    expect(res.status).toBe(500);
    expect(mocks.firmInsert).not.toHaveBeenCalled();
  });

  it("creates the firm with the accountant as admin and emails her the sign-in link", async () => {
    const res = await post({ name: "Bergström Redovisning AB", email: " Anna@Bergstrom.se " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, firmId: "f-new", emailed: true });
    expect(mocks.firmInsert).toHaveBeenCalledWith({ name: "Bergström Redovisning AB" });
    expect(mocks.memberInsert).toHaveBeenCalledWith({ firm_id: "f-new", email: "anna@bergstrom.se", role: "admin" });
    const mail = mocks.sendEmail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: "anna@bergstrom.se", tag: "firm_welcome", replyTo: "founder@unreceipt.com" });
    expect(mail.text).toContain("https://app.unreceipt.com/app/login?next=/firm");
  });

  it("is admin only", async () => {
    mocks.requireAdmin.mockRejectedValue(new AdminAuthError("not_admin"));
    expect((await post({ name: "Byrån AB", email: "a@b.se" })).status).toBe(403);
    expect(mocks.firmInsert).not.toHaveBeenCalled();
  });

  it("refuses an address already in a firm, and names that could fool a recipient", async () => {
    mocks.existing = { id: "m1" };
    expect((await post({ name: "Byrån AB", email: "a@b.se" })).status).toBe(409);
    mocks.existing = null;
    expect((await post({ name: "Skatteverket Redovisning", email: "a@b.se" })).status).toBe(400);
    expect((await post({ name: "Byrån AB", email: "not-an-address" })).status).toBe(400);
    expect(mocks.firmInsert).not.toHaveBeenCalled();
  });

  it("removes the firm again when its admin can't be added", async () => {
    mocks.memberInsert.mockReturnValue({ error: { code: "23505" } });
    expect((await post({ name: "Byrån AB", email: "a@b.se" })).status).toBe(409);
    expect(mocks.firmDeletes).toEqual(["f-new"]);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
