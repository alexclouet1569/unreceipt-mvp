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

  it("returns 400 when the file MIME type is unsupported", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    const fd = new FormData();
    fd.append("image", imageBlob("image/heic"), "r.heic");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported file type/i);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 400 when the file exceeds 15MB", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    const fd = new FormData();
    fd.append(
      "image",
      imageBlob("image/jpeg", 15 * 1024 * 1024 + 1),
      "big.jpg"
    );

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("returns 200 with the extracted JSON on success", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.extractReceipt.mockResolvedValue({
      merchant: "ICA",
      amount: 49.5,
      currency: "SEK",
    });
    const fd = new FormData();
    fd.append("image", imageBlob("image/jpeg"), "r.jpg");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ merchant: "ICA", amount: 49.5, currency: "SEK" });
    expect(mocks.extractReceipt).toHaveBeenCalledTimes(1);
    const [, mediaType] = mocks.extractReceipt.mock.calls[0];
    expect(mediaType).toBe("image/jpeg");
  });

  // ---------- PDF intake ----------

  // Minimal one-page PDF binary — single `/Type /Page` occurrence so the
  // page-count guard counts it as 1 page.
  const ONE_PAGE_PDF = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF",
    "latin1"
  );

  const pdfBlob = (bytes: Buffer = ONE_PAGE_PDF) =>
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" });

  it("accepts application/pdf and forwards to extractReceipt", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.extractReceipt.mockResolvedValue({
      merchant: "Stripe",
      amount: 29,
      currency: "USD",
    });
    const fd = new FormData();
    fd.append("image", pdfBlob(), "invoice.pdf");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(200);
    expect(mocks.extractReceipt).toHaveBeenCalledTimes(1);
    const [, mediaType] = mocks.extractReceipt.mock.calls[0];
    expect(mediaType).toBe("application/pdf");
  });

  it("rejects PDFs over the page-count cap", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    // 11 `/Type /Page` occurrences — one above the 10-page cap.
    const manyPages = Buffer.from(
      "%PDF-1.4\n" +
        Array.from({ length: 11 }, (_, i) => `${i} 0 obj\n<< /Type /Page >>\nendobj\n`).join("") +
        "%%EOF",
      "latin1"
    );
    const fd = new FormData();
    fd.append("image", pdfBlob(manyPages), "contract.pdf");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/pages/i);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
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
