// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { GET } from "../route";

const ID = "11111111-1111-1111-1111-111111111111";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  row: vi.fn(),
  download: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: () => mocks.user() }));
vi.mock("@/lib/receipts/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/receipts/access")>();
  return {
    ...actual,
    // The real one applies the owner / firm / mailbox-visibility rules; a
    // receipt the caller may not see comes back null.
    loadReceiptForActor: async () => {
      const row = mocks.row();
      return row ? { receipt: row, via: "owner" } : null;
    },
  };
});
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ download: (...a: unknown[]) => mocks.download(...a) }) } }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => mocks.rateLimit(...a),
  rateLimitedResponse: (s: number) => Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(s) } }),
}));

const req = (n: string) => new NextRequest(`http://localhost/api/receipts/${ID}/original/page/${n}`);
const params = (n: string, id = ID) => ({ params: Promise.resolve({ id, n }) });

function pdfRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    user_id: "user-1",
    source: "email",
    original_source_url: "user-1/abc.pdf",
    original_source_kind: "application/pdf",
    image_url: null,
    ...overrides,
  };
}

async function pdfBlob(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return { data: new Blob([(await doc.save()) as BlobPart]), error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "user-1" });
  mocks.rateLimit.mockResolvedValue({ ok: true });
});

describe("GET /api/receipts/[id]/original/page/[n]", () => {
  it("401 when signed out", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET(req("1"), params("1"))).status).toBe(401);
  });

  it("400 on a bad id or page number", async () => {
    for (const [id, n] of [["nope", "1"], [ID, "0"], [ID, "11"], [ID, "1.5"], [ID, "abc"]]) {
      expect((await GET(req(n), params(n, id))).status).toBe(400);
    }
  });

  it("404 for a receipt the caller may not see, without reading storage", async () => {
    mocks.row.mockReturnValue(null);
    expect((await GET(req("1"), params("1"))).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("404 when the original isn't a PDF, or lies outside the owner's folder", async () => {
    mocks.row.mockReturnValue(pdfRow({ original_source_url: "user-1/abc.eml", original_source_kind: "eml" }));
    expect((await GET(req("1"), params("1"))).status).toBe(404);
    mocks.row.mockReturnValue(pdfRow({ original_source_url: "user-2/abc.pdf" }));
    expect((await GET(req("1"), params("1"))).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("draws the page as a private PNG", async () => {
    mocks.row.mockReturnValue(pdfRow());
    mocks.download.mockResolvedValue(await pdfBlob(2));
    const res = await GET(req("2"), params("2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rateLimit).toHaveBeenCalledWith("originalPage", "user-1");
    expect(mocks.download).toHaveBeenCalledWith("user-1/abc.pdf");
  });

  it("404 past the last page, 422 for an unreadable file", async () => {
    mocks.row.mockReturnValue(pdfRow());
    mocks.download.mockResolvedValue(await pdfBlob(1));
    expect((await GET(req("2"), params("2"))).status).toBe(404);
    mocks.download.mockResolvedValue({ data: new Blob(["garbage"]), error: null });
    expect((await GET(req("1"), params("1"))).status).toBe(422);
  });

  it("429 over the limit, before downloading", async () => {
    mocks.row.mockReturnValue(pdfRow());
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    expect((await GET(req("1"), params("1"))).status).toBe(429);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
