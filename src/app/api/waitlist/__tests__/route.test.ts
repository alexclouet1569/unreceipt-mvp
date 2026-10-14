import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: mocks.insert }),
  }),
}));

import { POST } from "@/app/api/waitlist/route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );

const sentEmail = () => JSON.parse(String(mocks.fetch.mock.calls[0][1]?.body ?? "{}"));

describe("POST /api/waitlist", () => {
  const originalEnv = { ...process.env };
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.CONCIERGE_ADMIN_EMAILS = "founder@example.com, other@example.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.unreceipt.com";
    process.env.PILOT_MODE = "true";
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.fetch.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email_1" }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mocks.fetch);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("stores the normalised email and sends the waitlist email from hello@unreceipt.com", async () => {
    const res = await post({ email: "  Alex@Example.SE " });

    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: "alex@example.se", source: "landing_page" })
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    const body = sentEmail();
    expect(body.from).toBe("UnReceipt <hello@unreceipt.com>");
    expect(body.to).toBe("alex@example.se");
    expect(body.reply_to).toBe("founder@example.com");
    expect(body.subject).toBe("You're on the UnReceipt list");
    expect(body.html).toContain("https://app.unreceipt.com/app/login");
    expect(body.text).toContain("https://app.unreceipt.com/app/login");
  });

  it("says 'already on the list' and sends nothing for a duplicate email", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });

    const res = await post({ email: "alex@example.se" });

    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/already/i);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid email without touching the database", async () => {
    const res = await post({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid email/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 500 with a readable error when the insert fails", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });

    const res = await post({ email: "alex@example.se" });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/try again/i);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("logs but does not fail the signup when Resend returns 403", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("domain not verified"),
    });

    const res = await post({ email: "alex@example.se" });

    expect(res.status).toBe(201);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
