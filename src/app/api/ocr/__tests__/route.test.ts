// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  extractReceipt: vi.fn(),
  extractReceiptStreaming: vi.fn(),
}));

const productAccessMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/subscription-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/subscription-gate")>()),
  hasProductAccess: productAccessMock,
}));

const rateLimitMock = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> => ({ ok: true }))
);
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: rateLimitMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: mocks.getServerUser,
}));

vi.mock("@/lib/ocr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ocr")>()),
  extractReceipt: mocks.extractReceipt,
  extractReceiptStreaming: mocks.extractReceiptStreaming,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

import { GET, POST } from "@/app/api/ocr/route";

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

  it("returns 402 and skips the Claude call without an active subscription", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    productAccessMock.mockResolvedValueOnce(false);
    const fd = new FormData();
    fd.append("image", imageBlob(), "r.jpg");

    const res = await POST(buildRequest(fd));

    expect(res.status).toBe(402);
    expect(productAccessMock).toHaveBeenCalledWith(USER_ID);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("lets an admin use OCR (admin paste form) without a subscription", async () => {
    const previous = process.env.CONCIERGE_ADMIN_EMAILS;
    process.env.CONCIERGE_ADMIN_EMAILS = "founder@unreceipt.com";
    mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "founder@unreceipt.com" });
    productAccessMock.mockResolvedValue(false);
    mocks.extractReceipt.mockResolvedValue({ merchant: "ICA" });
    const fd = new FormData();
    fd.append("image", imageBlob(), "r.jpg");

    const res = await POST(buildRequest(fd));

    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith("ocr", USER_ID);
    productAccessMock.mockResolvedValue(true);
    if (previous === undefined) delete process.env.CONCIERGE_ADMIN_EMAILS;
    else process.env.CONCIERGE_ADMIN_EMAILS = previous;
  });

  it("returns 429 with Retry-After and skips the Claude call when rate limited", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    rateLimitMock.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 120 });
    const fd = new FormData();
    fd.append("image", imageBlob(), "r.jpg");

    const res = await POST(buildRequest(fd));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(rateLimitMock).toHaveBeenCalledWith("ocr", USER_ID);
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

  it("returns 400 when the file exceeds the 4 MB upload cap", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    const fd = new FormData();
    fd.append(
      "image",
      imageBlob("image/jpeg", 4 * 1024 * 1024 + 1),
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
    // 11 pages — one above the 10-page cap — saved with compressed object
    // streams, where a byte scan finds no `/Type /Page` at all.
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    for (let i = 0; i < 11; i++) doc.addPage([200, 300]);
    const manyPages = Buffer.from(await doc.save({ useObjectStreams: true }));
    const fd = new FormData();
    fd.append("image", pdfBlob(manyPages), "contract.pdf");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/pages/i);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when the OCR call throws, without leaking the cause", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID });
    mocks.extractReceipt.mockRejectedValue(new Error("anthropic down"));
    const fd = new FormData();
    fd.append("image", imageBlob("image/png"), "r.png");

    const res = await POST(buildRequest(fd));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("couldn't read this receipt");
    expect(JSON.stringify(body)).not.toContain("anthropic down");
  });
});

describe("POST /api/ocr?stream=1", () => {
  beforeEach(() => {
    mocks.getServerUser.mockReset();
    mocks.extractReceiptStreaming.mockReset();
  });

  const streamRequest = () => {
    const fd = new FormData();
    fd.append("image", imageBlob(), "r.jpg");
    return new NextRequest("http://localhost:3000/api/ocr?stream=1", { method: "POST", body: fd });
  };
  const lines = async (res: Response) =>
    (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

  it("sends the total and date as soon as they're written, then the full answer", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "a@b.se" });
    mocks.extractReceiptStreaming.mockImplementation(async (_b64, _type, onText) => {
      onText('{"merchant":"ICA","amo');
      onText('{"merchant":"ICA","amount":245.5,"currency":"SEK","receipt_date":"2026-11-01","items":[{"label":"Mjölk","total_amount":13.9');
      onText('{"merchant":"ICA","amount":245.5,"currency":"SEK","receipt_date":"2026-11-01","items":[{"label":"Mjölk","total_amount":13.9}]}');
      return { result: { merchant: "ICA", amount: 245.5, items: [{ label: "Mjölk", total_amount: 13.9 }] } };
    });

    const res = await POST(streamRequest());

    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const out = await lines(res);
    expect(out[0]).toEqual({ type: "partial", fields: { merchant: "ICA" } });
    expect(out[1]).toEqual({
      type: "partial",
      fields: { merchant: "ICA", currency: "SEK", receipt_date: "2026-11-01", amount: 245.5 },
    });
    // No partial line repeats an unchanged set of fields.
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({
      type: "result",
      result: { merchant: "ICA", amount: 245.5, items: [{ label: "Mjölk", total_amount: 13.9 }] },
    });
  });

  it("stops the model when the phone goes away, and reports nothing", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "a@b.se" });
    let modelSignal: AbortSignal | undefined;
    mocks.extractReceiptStreaming.mockImplementation(
      (_b64: string, _type: string, _onText: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          modelSignal = signal;
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const sentry = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(streamRequest());
    await res.body!.cancel();

    expect(modelSignal?.aborted).toBe(true);
    expect(sentry).not.toHaveBeenCalled();
  });

  it("ends with an error line, without the model's text, when reading fails", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "a@b.se" });
    mocks.extractReceiptStreaming.mockRejectedValue(new Error("secret receipt text"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await lines(await POST(streamRequest()));

    expect(out).toEqual([{ type: "error", error: "couldn't read this receipt" }]);
  });
});

describe("GET /api/ocr (warm-up)", () => {
  beforeEach(() => {
    mocks.getServerUser.mockReset();
    mocks.extractReceipt.mockReset();
  });

  it("answers signed-in users with 204 and calls no model", async () => {
    mocks.getServerUser.mockResolvedValue({ id: USER_ID, email: "a@b.se" });
    const res = await GET();
    expect(res.status).toBe(204);
    expect(mocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("refuses everyone else", async () => {
    mocks.getServerUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
