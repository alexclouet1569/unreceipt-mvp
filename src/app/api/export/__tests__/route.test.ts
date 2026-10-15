// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  rateLimit: vi.fn(),
  buildExport: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: mocks.getServerUser }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/export/build-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/build-export")>()),
  buildExport: mocks.buildExport,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/export/route";
import { ExportTooLargeError } from "@/lib/export/build-export";

const req = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerUser.mockResolvedValue({ id: "u1" });
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.buildExport.mockResolvedValue({
    receiptCount: 3,
    parts: [{ path: "u1/x.zip", filename: "unreceipt-2026-10.zip", url: "https://signed", bytes: 10 }],
  });
});

describe("POST /api/export", () => {
  it("requires a session", async () => {
    mocks.getServerUser.mockResolvedValueOnce(null);
    expect((await POST(req({ period: "2026-10" }))).status).toBe(401);
  });

  it("rejects a bad period before doing any work", async () => {
    expect((await POST(req({ period: "last month" }))).status).toBe(400);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.buildExport).not.toHaveBeenCalled();
  });

  it("is rate-limited", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 10 });
    expect((await POST(req({ period: "2026-10" }))).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("export", "u1");
  });

  it("returns the download links without the storage path", async () => {
    const res = await POST(req({ period: "2026-10" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      receiptCount: 3,
      parts: [{ filename: "unreceipt-2026-10.zip", url: "https://signed", bytes: 10 }],
    });
    expect(mocks.buildExport).toHaveBeenCalledWith("u1", { kind: "month", month: "2026-10" });
  });

  it("explains when there are too many receipts", async () => {
    mocks.buildExport.mockRejectedValueOnce(new ExportTooLargeError());
    const res = await POST(req({ period: "all" }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/one month at a time/);
  });

  it("hides internal errors", async () => {
    mocks.buildExport.mockRejectedValueOnce(new Error("export upload failed"));
    const res = await POST(req({ period: "all" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/upload/);
  });
});
