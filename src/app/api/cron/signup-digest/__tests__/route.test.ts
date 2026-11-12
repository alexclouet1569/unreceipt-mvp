// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runSignupDigest: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCron: (req: Request) => req.headers.get("authorization") === "Bearer s3cret",
}));
vi.mock("@/lib/signup-digest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/signup-digest")>()),
  runSignupDigest: mocks.runSignupDigest,
}));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
  captureException: mocks.captureException,
}));

import { GET } from "@/app/api/cron/signup-digest/route";

const req = (auth = "Bearer s3cret") =>
  new Request("https://app.unreceipt.com/api/cron/signup-digest", { headers: { authorization: auth } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/signup-digest", () => {
  it("refuses without the cron secret", async () => {
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(mocks.runSignupDigest).not.toHaveBeenCalled();
  });

  it("answers 200 when the digest went out or there was nothing to send", async () => {
    mocks.runSignupDigest.mockResolvedValueOnce({ sent: true, accounts: 2, waitlist: 0 });
    expect((await GET(req())).status).toBe(200);
    mocks.runSignupDigest.mockResolvedValueOnce({ sent: false, reason: "no_signups", accounts: 0, waitlist: 0 });
    expect((await GET(req())).status).toBe(200);
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it.each(["send_failed", "no_recipient"])("answers 500 when the digest wasn't sent (%s)", async (reason) => {
    mocks.runSignupDigest.mockResolvedValue({ sent: false, reason, accounts: 1, waitlist: 0 });
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ sent: false, reason });
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining(reason),
      expect.objectContaining({ tags: { area: "signup-digest", reason } })
    );
  });

  it("answers 500 when the run throws", async () => {
    mocks.runSignupDigest.mockRejectedValue(new Error("db down"));
    expect((await GET(req())).status).toBe(500);
    expect(mocks.captureException).toHaveBeenCalled();
  });
});
