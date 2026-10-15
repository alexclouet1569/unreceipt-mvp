// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  orFilter: null as string | null,
  files: {} as Record<string, Uint8Array>,
  uploads: [] as Array<{ bucket: string; path: string; size: number }>,
}));

vi.mock("@react-pdf/renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-pdf/renderer")>()),
  renderToBuffer: vi.fn(async () => Buffer.from("%PDF-fake")),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        or: (f: string) => {
          state.orFilter = f;
          return q;
        },
        order: () => q,
        limit: async () => ({ data: state.rows, error: null }),
      };
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          const bytes = state.files[`${bucket}/${path}`];
          return bytes
            ? { data: new Blob([bytes as BlobPart]), error: null }
            : { data: null, error: { message: "not found" } };
        },
        upload: async (path: string, data: Uint8Array) => {
          state.uploads.push({ bucket, path, size: data.length });
          return { error: null };
        },
        createSignedUrl: async (path: string, _s: number, opts: { download: string }) => ({
          data: { signedUrl: `https://signed/${path}?download=${opts.download}` },
          error: null,
        }),
      }),
    },
  }),
}));

import {
  MAX_EXPORT_RECEIPTS,
  PART_TARGET_BYTES,
  buildExport,
  fileBase,
  monthRange,
  parsePeriod,
} from "@/lib/export/build-export";

const row = (i: number, o: Record<string, unknown> = {}) => ({
  id: `0000000${i}-0000-4000-8000-000000000000`,
  user_id: USER_ID,
  merchant_name: `Shop ${i}`,
  purchased_at: "2026-10-03T12:00:00.000Z",
  receipt_date: "2026-10-03",
  total: 10,
  currency: "SEK",
  category: "other",
  status: "verified",
  source: "paper",
  image_url: `${USER_ID}/img${i}.jpg`,
  original_source_url: null,
  created_at: "2026-10-03T12:00:00.000Z",
  edited_at: null,
  ...o,
});

beforeEach(() => {
  state.rows = [];
  state.orFilter = null;
  state.files = {};
  state.uploads = [];
});

describe("export helpers", () => {
  it("parses a month or 'all' only", () => {
    expect(parsePeriod("2026-10")).toEqual({ kind: "month", month: "2026-10" });
    expect(parsePeriod("all")).toEqual({ kind: "all" });
    expect(parsePeriod("2026-13")).toBeNull();
    expect(parsePeriod("2026-10-01")).toBeNull();
    expect(parsePeriod("2026-10),or(user_id.neq.x")).toBeNull();
    expect(parsePeriod(42)).toBeNull();
  });

  it("computes month bounds across the year end", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-03-01" });
  });

  it("names files date_merchant_shortid", () => {
    expect(fileBase(row(1) as never)).toBe("2026-10-03_shop-1_00000001");
  });
});

describe("buildExport", () => {
  it("returns no parts when the period is empty", async () => {
    expect(await buildExport(USER_ID, { kind: "month", month: "2026-10" })).toEqual({
      receiptCount: 0,
      parts: [],
    });
    expect(state.orFilter).toContain("purchased_at.gte.2026-10-01");
    expect(state.uploads).toEqual([]);
  });

  it("uploads one ZIP to the user's folder in the exports bucket", async () => {
    state.rows = [row(1), row(2, { status: "pending_review" })];
    state.files[`receipts/${USER_ID}/img1.jpg`] = new Uint8Array(100);
    state.files[`receipts/${USER_ID}/img2.jpg`] = new Uint8Array(100);

    const res = await buildExport(
      USER_ID,
      { kind: "month", month: "2026-10" },
      new Date("2026-11-01T09:00:00Z"),
    );

    expect(res.receiptCount).toBe(2);
    expect(res.parts).toHaveLength(1);
    expect(res.parts[0].filename).toBe("unreceipt-2026-10.zip");
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0].bucket).toBe("exports");
    expect(state.uploads[0].path.startsWith(`${USER_ID}/`)).toBe(true);
  });

  it("splits into parts under the size target", async () => {
    const big = Math.floor(PART_TARGET_BYTES * 0.6);
    state.rows = [row(1), row(2), row(3)];
    for (const i of [1, 2, 3]) {
      state.files[`receipts/${USER_ID}/img${i}.jpg`] = new Uint8Array(big);
    }

    const res = await buildExport(USER_ID, { kind: "all" }, new Date("2026-11-01T09:00:00Z"));

    expect(res.parts.map((p) => p.filename)).toEqual([
      "unreceipt-all-receipts-2026-11-01-part-1.zip",
      "unreceipt-all-receipts-2026-11-01-part-2.zip",
      "unreceipt-all-receipts-2026-11-01-part-3.zip",
    ]);
    for (const u of state.uploads) expect(u.size).toBeLessThan(PART_TARGET_BYTES + 1024 * 1024);
  });

  it("never reads a file outside the user's folder", async () => {
    state.rows = [row(1, { image_url: "someone-else/img.jpg" })];
    state.files["receipts/someone-else/img.jpg"] = new Uint8Array(10);

    const res = await buildExport(USER_ID, { kind: "all" });
    // Only the README, CSV and PDF: the foreign file was skipped.
    expect(res.parts[0].bytes).toBeLessThan(2000);
  });

  it("refuses more than the receipt cap", async () => {
    state.rows = Array.from({ length: MAX_EXPORT_RECEIPTS + 1 }, (_, i) => row(i));
    await expect(buildExport(USER_ID, { kind: "all" })).rejects.toThrow(/too many/);
  });
});
