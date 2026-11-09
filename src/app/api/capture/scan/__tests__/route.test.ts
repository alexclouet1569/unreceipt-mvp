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

const post = (file: File | null) => {
  const form = new FormData();
  if (file) form.append("file", file);
  return POST(new NextRequest("https://app.unreceipt.com/api/capture/scan", { method: "POST", body: form }));
};
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], "r.jpg", { type: "image/jpeg" });

beforeEach(() => {
  mocks.user = { id: "u-1" };
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
    expect(row).toMatchObject({ user_id: "u-1", organization_id: "org-1", source: "paper", status: "pending_review", notes: null });
    expect(String(row.image_url)).toMatch(/^u-1\/[0-9a-f-]{36}\.jpg$/);
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
    mocks.user = { id: "u-1" };
    mocks.access = false;
    expect((await post(jpeg())).status).toBe(402);
    mocks.access = true;
    mocks.limits.ocr = { ok: false, retryAfterSeconds: 60 };
    expect((await post(jpeg())).status).toBe(429);
    mocks.limits.ocr = { ok: true };
    const twoPages = new File(["%PDF-1.4 /Type /Page /Type /Page"], "s.pdf", { type: "application/pdf" });
    expect((await post(twoPages)).status).toBe(400);
    expect((await post(new File(["x"], "a.gif", { type: "image/gif" }))).status).toBe(400);
    expect(mocks.ocr).not.toHaveBeenCalled();
  });
});
