// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  rateLimit: vi.fn(),
  deleteAccount: vi.fn(),
  cookies: [] as Array<{ name: string; value: string }>,
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/account-deletion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account-deletion")>()),
  deleteAccount: mocks.deleteAccount,
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ getAll: () => mocks.cookies }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/account/delete/route";
import { AccountDeletionError } from "@/lib/account-deletion";

const freshUser = () => ({
  id: USER_ID,
  email: "owner@example.se",
  last_sign_in_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
});

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://app.unreceipt.com/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "app.unreceipt.com",
      origin: "https://app.unreceipt.com",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue(freshUser());
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.deleteAccount.mockResolvedValue({ canceledSubscriptions: 0, removedFiles: 3 });
  mocks.cookies = [{ name: "sb-proj-auth-token", value: "x" }];
});

describe("POST /api/account/delete", () => {
  it("returns 401 when signed out", async () => {
    mocks.getServerUser.mockResolvedValueOnce(null);
    const res = await POST(req({ confirm: "DELETE" }));
    expect(res.status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("refuses a cross-site request", async () => {
    const res = await POST(
      req({ confirm: "DELETE" }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 60 });
    const res = await POST(req({ confirm: "DELETE" }));
    expect(res.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("accountDelete", USER_ID);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("requires the typed confirmation", async () => {
    const res = await POST(req({ confirm: "delete" }));
    expect(res.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("asks for a fresh sign-in when the last one is older than 30 minutes", async () => {
    mocks.getServerUser.mockResolvedValueOnce({
      ...freshUser(),
      last_sign_in_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    const res = await POST(req({ confirm: "DELETE" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "reauth_required" });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes the account and clears the session cookies", async () => {
    const res = await POST(req({ confirm: "DELETE" }));
    expect(res.status).toBe(200);
    expect(mocks.deleteAccount).toHaveBeenCalledWith(USER_ID, {
      email: "owner@example.se",
    });
    expect(res.headers.get("set-cookie")).toMatch(/sb-proj-auth-token=;/);
  });

  it("returns a generic 500 when a step fails", async () => {
    mocks.deleteAccount.mockRejectedValueOnce(
      new AccountDeletionError("stripe", "subscription cancel failed"),
    );
    const res = await POST(req({ confirm: "DELETE" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/stripe/i);
  });
});
