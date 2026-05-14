import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const mockGetServerUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockDownload = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

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

function makeRequest() {
  return new NextRequest(
    `http://localhost/api/receipts/${FIXTURE_ID}/original`
  );
}

function params() {
  return { params: Promise.resolve({ id: FIXTURE_ID }) };
}

function paperRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_ID,
    source: "paper",
    merchant_name: "ICA Maxi",
    purchased_at: "2026-05-10T12:00:00Z",
    receipt_date: null,
    image_url: "user-id/uuid.jpg",
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

  it("signs from receipt-originals + inlines preview for email .eml", async () => {
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
    mockDownload.mockResolvedValue({
      data: { text: async () => rawEml },
      error: null,
    });

    const res = await GET(makeRequest(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("eml");
    expect(body.preview.type).toBe("eml");
    expect(body.preview.from).toContain("Uber");
    expect(body.preview.subject).toBe("Your Friday morning trip with Uber");
    expect(body.preview.text).toContain("194.00 SEK");
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
    mockDownload.mockResolvedValue({
      data: { text: async () => "Köp 194,00 SEK hos ICA MAXI 2026-05-10" },
      error: null,
    });

    const res = await GET(makeRequest(), params());
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
