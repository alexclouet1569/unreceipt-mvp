// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  extractReceipt: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mocks.getServerUser,
}));

vi.mock("@/lib/ocr", () => ({
  extractReceipt: mocks.extractReceipt,
}));

import { POST } from "@/app/api/ocr/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const imageBlob = (type = "image/jpeg", size = 1024) =>
  new Blob([new Uint8Array(size)], { type });

const buildRequest = (fd: FormData) =>
  new NextRequest("http://localhost:3000/api/ocr", {
    method: "POST",
    body: fd,
  });

describe("POST /api/ocr", () => {
  beforeEach(() => {
    mocks.getServerUser.mockReset();
    mocks.extractReceipt.mockReset();
  });

  it("returns 401 when no user is logged in", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    const fd = new FormData();
    fd.append("image", imageBlob(), "r.jpg");

    const res = await POST(buildRequest(fd));

    expect(res.status).toBe(401);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 400 when no image is attached", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    const fd = new FormData();

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/image file required/i);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 400 when the image MIME type is unsupported", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    const fd = new FormData();
    fd.append("image", imageBlob("image/heic"), "r.heic");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported image type/i);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 400 when the image exceeds 5MB", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    const fd = new FormData();
    fd.append("image", imageBlob("image/jpeg", 5 * 1024 * 1024 + 1), "big.jpg");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 200 with parser-canonicalized JSON + parse_confidence on success", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.extractReceipt.mockResolvedValue({
      merchant: "ICA",
      amount: 49.5,
      currency: "SEK",
      receipt_date: "2026-05-03",
      category: "office_supplies",
      confidence: 0.9,
    });
    const fd = new FormData();
    fd.append("image", imageBlob("image/jpeg"), "r.jpg");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      not_a_receipt: false,
      merchant: "ICA",
      amount: 49.5,
      currency: "SEK",
      receipt_date: "2026-05-03",
      category: "office_supplies",
    });
    expect(body.parse_confidence).toBeCloseTo(0.9, 2);
    expect(mocks.extractReceipt).toHaveBeenCalledTimes(1);
    const [, mediaType] = mocks.extractReceipt.mock.calls[0];
    expect(mediaType).toBe("image/jpeg");
  });

  it("returns 200 with not_a_receipt=true when the parser says so", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.extractReceipt.mockResolvedValue({ not_a_receipt: true });
    const fd = new FormData();
    fd.append("image", imageBlob("image/jpeg"), "r.jpg");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.not_a_receipt).toBe(true);
    expect(body.parse_confidence).toBe(0);
  });

  it("returns 500 when the OCR call throws", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.extractReceipt.mockRejectedValue(new Error("anthropic down"));
    const fd = new FormData();
    fd.append("image", imageBlob("image/png"), "r.png");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/anthropic down/);
  });
});
