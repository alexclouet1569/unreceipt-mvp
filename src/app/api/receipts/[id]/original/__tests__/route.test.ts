// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { NextRequest } from "next/server";
import { GET } from "../route";

const mockGetServerUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockDownload = vi.fn();
const mockRateLimit = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...(args as [])),
  rateLimitedResponse: (s: number) =>
    Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(s) } }),
}));

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

vi.mock("@/lib/receipts/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/receipts/access")>();
  return {
    ...actual,
    loadReceiptForActor: async (user: { id: string }) => {
      const r = (await mockMaybeSingle()) as { data: Record<string, unknown> | null; error: unknown };
      if (r?.error) throw new actual.ReceiptAccessError();
      if (!r?.data) return null;
      return r.data.user_id === user.id
        ? { receipt: r.data, via: "owner" }
        : { receipt: r.data, via: "firm", firmId: "firm-1" };
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [],
      set: () => {},
    }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockMaybeSingle(),
        }),
      }),
    }),
  }),
}));

// Storage now goes through getSupabaseAdmin() (service-role) because the
// `receipts` / `receipt-originals` buckets aren't wired for anon-key
// reads — uploads happen via the admin client too, so downloads mirror.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
        download: (...args: unknown[]) => mockDownload(...args),
      }),
    },
  }),
}));

// Workaround: process.env needs the public Supabase vars to be set or
// the route handler will throw on the non-null assertions at import
// time on some runtimes. Vitest jsdom env keeps process.env mutable.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-key";

const FIXTURE_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/receipts/${FIXTURE_ID}/original${query}`
  );
}

// Storage's download() answers a Blob.
function blob(content: string | Uint8Array) {
  return { data: new Blob([content as BlobPart]), error: null };
}

function params() {
  return { params: Promise.resolve({ id: FIXTURE_ID }) };
}

function paperRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_ID,
    user_id: "user-1",
    source: "paper",
    merchant_name: "ICA Maxi",
    purchased_at: "2026-05-10T12:00:00Z",
    receipt_date: null,
    image_url: "user-1/uuid.jpg",
    original_source_url: null,
    original_source_kind: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetServerUser.mockReset();
  mockMaybeSingle.mockReset();
  mockCreateSignedUrl.mockReset();
  mockDownload.mockReset();
  mockRateLimit.mockReset();
  mockRateLimit.mockResolvedValue({ ok: true });
});

describe("GET /api/receipts/[id]/original", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue(null);
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid id", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    const res = await GET(
      new NextRequest("http://localhost/api/receipts/not-a-uuid/original"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when row is not found (RLS hides other-user rows)", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(404);
  });

  it("returns no_original 404 for a manual-entry receipt", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ source: "manual", image_url: null }),
      error: null,
    });
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no_original");
  });

  it("returns no_original 404 when neither image_url nor original_source_url is set", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ image_url: null }),
      error: null,
    });
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no_original");
  });

  it("refuses to sign a path outside the caller's own storage folder", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ image_url: "user-2/their-receipt.jpg" }),
      error: null,
    });
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(404);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it("signs from the receipts bucket for legacy paper rows (image_url)", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({ data: paperRow(), error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/paper.jpg" },
      error: null,
    });
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://signed.example/paper.jpg");
    expect(body.kind).toBe("image/jpeg");
    expect(body.filename).toMatch(/^original-ica-maxi-2026-05-10\.jpg$/);
  });

  it("signs from receipt-originals + inlines a plain-text preview for email .eml (?preview=1)", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({
        source: "email",
        original_source_url: "user-1/abc.eml",
        original_source_kind: "eml",
        image_url: null,
      }),
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/abc.eml" },
      error: null,
    });
    const rawEml = [
      "From: Uber Receipts <receipts@uber.com>",
      "To: alex@unreceipt.com",
      "Subject: Your Friday morning trip with Uber",
      "Date: Fri, 9 May 2026 09:18:00 +0200",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Total: 194.00 SEK",
      "",
      "Thanks for riding with Uber.",
    ].join("\r\n");
    mockDownload.mockResolvedValue(blob(rawEml));

    const res = await GET(makeRequest("?preview=1"), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("eml");
    expect(body.preview.type).toBe("eml");
    expect(body.preview.from).toContain("Uber");
    expect(body.preview.subject).toBe("Your Friday morning trip with Uber");
    expect(body.preview.text).toContain("194.00 SEK");
    expect(body.preview.date).toBe("2026-05-09T07:18:00.000Z");
    expect(body.preview).not.toHaveProperty("to");
    expect(mockRateLimit).toHaveBeenCalledWith("originalView", "user-1");
  });

  it("never sends an email's HTML: an HTML-only email comes back as text", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ source: "email", original_source_url: "user-1/abc.eml", original_source_kind: "eml", image_url: null }),
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/abc.eml" }, error: null });
    const rawEml = [
      "From: Shop <shop@example.com>",
      "Subject: Receipt",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<html><head><style>p{color:red}</style></head><body><img src="https://track.example/p.gif"><script>alert(1)</script><p>Total <b>99,00 kr</b></p><a href="https://evil.example">Click</a></body></html>',
    ].join("\r\n");
    mockDownload.mockResolvedValue(blob(rawEml));
    const res = await GET(makeRequest("?preview=1"), params());
    const body = await res.json();
    expect(body.preview.text).toContain("Total 99,00 kr");
    const all = body.preview.text as string;
    expect(all).not.toMatch(/<|track\.example|evil\.example|alert|color:red/);
  });

  it("reads nothing without ?preview=1 (sharing only needs the link)", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ source: "email", original_source_url: "user-1/abc.eml", original_source_kind: "eml", image_url: null }),
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/abc.eml" }, error: null });
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBeUndefined();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("describes a PDF's pages for the viewer", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ source: "email", original_source_url: "user-1/abc.pdf", original_source_kind: "application/pdf", image_url: null }),
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/abc.pdf" }, error: null });
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([300, 600]).drawText("Total 20.00", { x: 20, y: 500, size: 12, font });
    doc.addPage([595, 842]);
    mockDownload.mockResolvedValue(blob(await doc.save()));
    const res = await GET(makeRequest("?preview=1"), params());
    const body = await res.json();
    expect(body.preview).toEqual({
      type: "pdf",
      pages: [
        { width: 300, height: 600 },
        { width: 595, height: 842 },
      ],
      total: 2,
    });
  });

  it("says unavailable for a PDF it can't read", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ source: "email", original_source_url: "user-1/abc.pdf", original_source_kind: "application/pdf", image_url: null }),
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/abc.pdf" }, error: null });
    mockDownload.mockResolvedValue(blob("not a pdf at all"));
    const res = await GET(makeRequest("?preview=1"), params());
    expect(res.status).toBe(200);
    expect((await res.json()).preview).toEqual({ type: "unavailable" });
  });

  it("answers 429 when previews are over the limit", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({ source: "email", original_source_url: "user-1/abc.eml", original_source_kind: "eml", image_url: null }),
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/abc.eml" }, error: null });
    mockRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 } as never);
    const res = await GET(makeRequest("?preview=1"), params());
    expect(res.status).toBe(429);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("inlines preview for SMS .txt", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({
      data: paperRow({
        source: "sms",
        original_source_url: "user-1/abc.txt",
        original_source_kind: "txt",
        image_url: null,
      }),
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/abc.txt" },
      error: null,
    });
    mockDownload.mockResolvedValue(blob("Köp 194,00 SEK hos ICA MAXI 2026-05-10"));

    const res = await GET(makeRequest("?preview=1"), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("txt");
    expect(body.preview.type).toBe("txt");
    expect(body.preview.body).toContain("ICA MAXI");
  });

  it("returns 500 when signing fails", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockMaybeSingle.mockResolvedValue({ data: paperRow(), error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(500);
  });
});
