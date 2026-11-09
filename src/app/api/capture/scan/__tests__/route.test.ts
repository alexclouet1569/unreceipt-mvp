// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: { id: "u-1" } as { id: string } | null,
  access: true,
  limits: { ocr: { ok: true }, capture: { ok: true } } as Record<string, { ok: boolean; retryAfterSeconds?: number }>,
  ocr: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  uploads: [] as string[],
  removed: [] as string[],
  existing: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase-server", () => ({ getServerUser: async () => mocks.user }));
vi.mock("@/lib/receipts/pdf-pages", async (orig) => ({
  ...(await orig<typeof import("@/lib/receipts/pdf-pages")>()),
  pdfPageCount: async (buf: Buffer) => (buf.toString().startsWith("%PDF-fake") ? Number(buf.toString().split(":")[1]) : null),
}));
vi.mock("@/lib/subscription-gate", () => ({
  hasProductAccess: async () => mocks.access,
  subscriptionRequiredResponse: () => new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (name: string) => mocks.limits[name],
  rateLimitedResponse: (s: number) => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Retry-After": String(s) } }),
}));
vi.mock("@/lib/organizations", () => ({ getOrCreateDefaultOrganization: async () => "org-1" }));
vi.mock("@/lib/fx", () => ({ homeCurrencyOf: async () => "SEK" }));
vi.mock("@/lib/ocr", () => ({ extractReceipt: mocks.ocr }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => (mocks.uploads.push(path), { error: null }),
        remove: async (paths: string[]) => (mocks.removed.push(...paths), { error: null }),
      }),
    },
    from: () => {
      let row: Record<string, unknown> | null = null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (mocks.filters.push([c, v]), chain),
        limit: async () => ({ data: mocks.existing, error: null }),
        insert: (r: Record<string, unknown>) => ((row = r), mocks.inserted.push(r), chain),
        single: async () => ({ data: row, error: null }),
      };
      return chain;
    },
  }),
}));

import { DUPLICATE_NOTE, POST } from "@/app/api/capture/scan/route";

const post = (file: File | null, extra: Record<string, string> = {}) => {
  const form = new FormData();
  if (file) form.append("file", file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return POST(new NextRequest("https://app.unreceipt.com/api/capture/scan", { method: "POST", body: form }));
};
const USER = "11111111-1111-4111-8111-111111111111";
const SCAN = `${USER}/scans/22222222-2222-4222-8222-222222222222.pdf`;
const fakePdf = (pages: number) => new File([`%PDF-fake:${pages}`], "s.pdf", { type: "application/pdf" });
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], "r.jpg", { type: "image/jpeg" });

beforeEach(() => {
  mocks.user = { id: USER };
  mocks.access = true;
  mocks.limits = { ocr: { ok: true }, capture: { ok: true } };
  mocks.ocr.mockReset().mockResolvedValue({ merchant: "Byggmax", amount: 2486, currency: "SEK", receipt_date: "2026-11-01", confidence: 0.98 });
  mocks.inserted = [];
  mocks.uploads = [];
  mocks.removed = [];
  mocks.existing = [];
  mocks.filters = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/capture/scan", () => {
  it("saves a read receipt to the user's company, waiting for a confirmation", async () => {
    const res = await post(jpeg());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, merchant: "Byggmax", total: 2486, status: "pending_review", missing: null, duplicate: false });
    const row = mocks.inserted[0];
    expect(row).toMatchObject({ user_id: USER, organization_id: "org-1", source: "paper", status: "pending_review", notes: null, original_source_url: null });
    expect(String(row.image_url)).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.jpg$`));
    expect(mocks.uploads).toEqual([row.image_url]);
  });

  it("keeps a photo it couldn't read, for the person to fill in", async () => {
    mocks.ocr.mockRejectedValue(new Error("model down"));
    const body = await (await post(jpeg())).json();
    expect(body).toMatchObject({ ok: true, status: "pending_review", missing: "merchant, amount and date" });
  });

  it("saves nothing for a picture that isn't a receipt", async () => {
    mocks.ocr.mockResolvedValue({ not_a_receipt: true });
    expect(await (await post(jpeg())).json()).toMatchObject({ skipped: true });
    expect(mocks.inserted).toHaveLength(0);
    expect(mocks.uploads).toHaveLength(0);
  });

  it("notes a possible duplicate within the same company", async () => {
    mocks.existing = [{ merchant_name: "BYGGMAX", total: 2486, receipt_date: "2026-11-01" }];
    const body = await (await post(jpeg())).json();
    expect(body.duplicate).toBe(true);
    expect(mocks.inserted[0].notes).toBe(DUPLICATE_NOTE);
    expect(mocks.filters).toContainEqual(["organization_id", "org-1"]);
  });

  it("refuses without a session, without access, over the limits, or with a multi-page PDF", async () => {
    mocks.user = null;
    expect((await post(jpeg())).status).toBe(401);
    mocks.user = { id: USER };
    mocks.access = false;
    expect((await post(jpeg())).status).toBe(402);
    mocks.access = true;
    mocks.limits.ocr = { ok: false, retryAfterSeconds: 60 };
    expect((await post(jpeg())).status).toBe(429);
    mocks.limits.ocr = { ok: true };
    expect((await post(fakePdf(2))).status).toBe(400);
    expect((await post(new File(["junk"], "x.pdf", { type: "application/pdf" }))).status).toBe(400);
    expect((await post(new File(["x"], "a.gif", { type: "image/gif" }))).status).toBe(400);
    expect(mocks.ocr).not.toHaveBeenCalled();
  });

  it("reads a whole PDF of several pages as one receipt, up to the cap", async () => {
    expect((await post(fakePdf(3), { whole: "1" })).status).toBe(200);
    expect((await post(fakePdf(11), { whole: "1" })).status).toBe(400);
  });

  it("links a page receipt to the user's own stored scan, and skips a page that isn't a receipt", async () => {
    const res = await post(fakePdf(1), { scan: SCAN, page: "2", pages: "3" });
    expect(res.status).toBe(200);
    expect(mocks.inserted[0]).toMatchObject({ original_source_url: SCAN, original_source_kind: "application/pdf" });
    expect(String(mocks.inserted[0].notes)).toContain("Page 2 of 3 of a scanned PDF");

    mocks.ocr.mockResolvedValue({ not_a_receipt: true });
    expect(await (await post(fakePdf(1), { scan: SCAN, page: "3", pages: "3" })).json()).toMatchObject({
      skipped: true,
      reason: "Not a receipt: kept in the original scan.",
    });
  });

  it("refuses a scan path that isn't the user's own, or a page out of range", async () => {
    const other = "99999999-9999-4999-8999-999999999999/scans/22222222-2222-4222-8222-222222222222.pdf";
    expect((await post(fakePdf(1), { scan: other, page: "1", pages: "2" })).status).toBe(400);
    expect((await post(fakePdf(1), { scan: `${USER}/../x.pdf`, page: "1", pages: "2" })).status).toBe(400);
    expect((await post(fakePdf(1), { scan: SCAN, page: "4", pages: "3" })).status).toBe(400);
    expect((await post(jpeg(), { scan: SCAN, page: "1", pages: "2" })).status).toBe(400);
    expect(mocks.ocr).not.toHaveBeenCalled();
  });
});
