import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fromBuilder: () => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    insert: () => Promise.resolve({ error: null }),
  }),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: mocks.fromBuilder,
  }),
}));

import { POST } from "@/app/api/waitlist/route";

describe("POST /api/waitlist — Resend sender", () => {
  const originalKey = process.env.RESEND_API_KEY;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_123";
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", mocks.fetch);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("sends the welcome email from hello@unreceipt.com", async () => {
    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ email: "alex@example.se" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const args = mocks.fetch.mock.calls[0];
    expect(args[0]).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(args[1]?.body ?? "{}"));
    expect(body.from).toBe("UnReceipt <hello@unreceipt.com>");
    expect(body.to).toBe("alex@example.se");
  });

  it("logs but does not fail the waitlist signup when Resend returns 403", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("domain not verified"),
    });

    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ email: "alex@example.se" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
