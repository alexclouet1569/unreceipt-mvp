// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  orFilter: null as string | null,
  files: {} as Record<string, Uint8Array>,
  uploads: [] as Array<{ bucket: string; path: string; size: number }>,
  previous: [] as Array<{ name: string; id: string | null }>,
  removed: [] as string[][],
  eqs: [] as [string, unknown][],
  isNull: [] as string[],
  stamps: [] as Array<{ payload: Record<string, unknown>; ids: string[] }>,
  uploadError: null as null | { message: string },
}));

vi.mock("@react-pdf/renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-pdf/renderer")>()),
  renderToBuffer: vi.fn(async () => Buffer.from("%PDF-fake")),
}));

// Currency conversion has its own tests (src/lib/__tests__/fx.test.ts).
vi.mock("@/lib/fx", () => ({
  ensureHomeAmounts: async (rows: unknown[]) => rows,
  homeCurrencyOf: async () => "SEK",
}));
vi.mock("@/lib/organizations", () => ({ getDefaultOrganizationId: async () => "org-1" }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          state.eqs.push([c, v]);
          return q;
        },
        is: (c: string) => {
          state.isNull.push(c);
          return q;
        },
        or: (f: string) => {
          state.orFilter = f;
          return q;
        },
        order: () => q,
        limit: async () => ({ data: state.rows, error: null }),
        update: (payload: Record<string, unknown>) => ({
          in: (_c: string, ids: string[]) => ({
            is: async () => {
              state.stamps.push({ payload, ids });
              return { error: null };
            },
          }),
        }),
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
        list: async () => ({ data: state.previous, error: null }),
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { error: null };
        },
        upload: async (path: string, data: Uint8Array) => {
          state.uploads.push({ bucket, path, size: data.length });
          return { error: state.uploadError };
        },
        createSignedUrl: async (path: string, _s: number, opts: { download: string }) => ({
          data: { signedUrl: `https://signed/${path}?download=${opts.download}` },
          error: null,
        }),
      }),
    },
  }),
}));

import { FX_CONVERTED_CURRENCIES, INPUT_VAT_CURRENCY } from "@/lib/bookkeeping/rules";
import {
  MAX_EXPORT_RECEIPTS,
  PART_TARGET_BYTES,
  buildExport,
  fileBase,
  monthRange,
  parsePeriod,
  readme,
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
  state.previous = [];
  state.removed = [];
  state.eqs = [];
  state.isNull = [];
  state.stamps = [];
  state.uploadError = null;
});

const own = (period: Parameters<typeof parsePeriod>[0] extends unknown ? ReturnType<typeof parsePeriod> : never, now?: Date) =>
  buildExport({ scope: { kind: "user", userId: USER_ID }, actorUserId: USER_ID, period: period!, now });

describe("export helpers", () => {
  it("parses a month or 'all' only", () => {
    expect(parsePeriod("2026-10")).toEqual({ kind: "month", month: "2026-10" });
    expect(parsePeriod("all")).toEqual({ kind: "all" });
    expect(parsePeriod("2026-13")).toBeNull();
    expect(parsePeriod("2026-10-01")).toBeNull();
    expect(parsePeriod("2024")).toEqual({ kind: "year", year: "2024" });
    expect(parsePeriod("1999")).toBeNull();
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

  it("describes the SEK columns of bookkeeping.csv as they are", () => {
    const now = new Date("2026-11-05T09:00:00Z");
    // Lines are wrapped for a text editor; join them to match phrases.
    const firm = readme("2026-10", 1, null, now, null, true).replace(/\s+/g, " ");
    expect(firm).not.toContain("no conversion is done");
    expect(firm).toContain("Total SEK is real kronor only");
    expect(firm).toContain("Total SEK (ECB estimate)");
    expect(firm).toContain("ESTIMATE, not what the bank charged");
    expect(firm).toContain("A bank-statement amount always takes precedence");
    expect(firm).toContain("Only EUR, USD, GBP, NOK, DKK, CHF and PLN get an estimate");
    // A typed amount works for any currency, so nothing may promise a blank.
    expect(firm).toContain("Total SEK blank until the bank-statement amount is typed in");
    expect(firm).toContain("SUGGESTION");
    // The currency list is typed by hand: it must be exactly the set fx.ts
    // converts, minus SEK itself.
    const listed = firm.match(/Only ([A-Z, ]+ and [A-Z]{3}) get an estimate/)?.[1];
    expect(listed?.split(/, | and /).sort()).toEqual(
      FX_CONVERTED_CURRENCIES.filter((c) => c !== INPUT_VAT_CURRENCY).sort()
    );
    // A customer's own export has no bookkeeping.csv, so no word of it.
    const own = readme("2026-10", 1, null, now, null, false);
    expect(own).not.toContain("bookkeeping.csv");
    expect(own).not.toContain("ECB");
  });
});

describe("buildExport", () => {
  it("returns no parts when the period is empty", async () => {
    expect(await own({ kind: "month", month: "2026-10" })).toEqual({
      receiptCount: 0,
      missing: 0,
      parts: [],
    });
    expect(state.orFilter).toBe(
      "and(receipt_date.gte.2026-10-01,receipt_date.lt.2026-11-01)," +
        "and(receipt_date.is.null,purchased_at.gte.2026-10-01T00:00:00Z,purchased_at.lt.2026-11-01T00:00:00Z)",
    );
    expect(state.uploads).toEqual([]);
  });

  it("uploads one ZIP to the user's folder in the exports bucket", async () => {
    state.rows = [row(1), row(2, { status: "pending_review" })];
    state.files[`receipts/${USER_ID}/img1.jpg`] = new Uint8Array(100);
    state.files[`receipts/${USER_ID}/img2.jpg`] = new Uint8Array(100);

    const res = await own({ kind: "month", month: "2026-10" }, new Date("2026-11-01T09:00:00Z"));

    expect(res.receiptCount).toBe(2);
    expect(res.parts).toHaveLength(1);
    expect(res.parts[0].filename).toBe("unreceipt-2026-10.zip");
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0].bucket).toBe("exports");
    expect(state.uploads[0].path.startsWith(`${USER_ID}/self-`)).toBe(true);
    expect(state.eqs).toEqual([["user_id", USER_ID]]);
    expect(state.stamps).toEqual([]);
  });

  it("splits into parts under the size target", async () => {
    const big = Math.floor(PART_TARGET_BYTES * 0.6);
    state.rows = [row(1), row(2), row(3)];
    for (const i of [1, 2, 3]) {
      state.files[`receipts/${USER_ID}/img${i}.jpg`] = new Uint8Array(big);
    }

    const res = await own({ kind: "all" }, new Date("2026-11-01T09:00:00Z"));

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

    const res = await own({ kind: "all" });
    // Only the README, CSV and PDF: the foreign file was skipped.
    expect(res.parts[0].bytes).toBeLessThan(2000);
  });

  it("refuses more than the receipt cap", async () => {
    state.rows = Array.from({ length: MAX_EXPORT_RECEIPTS + 1 }, (_, i) => row(i));
    await expect(own({ kind: "all" })).rejects.toThrow(/too many/);
  });

  it("replaces the user's previous export and counts files it couldn't read", async () => {
    state.previous = [
      { name: "self-old.zip", id: "1" },
      // A firm export for a client, kept: its link may still be in use.
      { name: "33333333-3333-4333-8333-333333333333-old.zip", id: "2" },
    ];
    state.rows = [row(1)]; // its photo isn't in storage

    const res = await own({ kind: "year", year: "2026" });

    expect(state.removed).toEqual([[`${USER_ID}/self-old.zip`]]);
    expect(res.missing).toBe(1);
    expect(state.orFilter).toBe(
      "and(receipt_date.gte.2026-01-01,receipt_date.lt.2027-01-01)," +
        "and(receipt_date.is.null,purchased_at.gte.2026-01-01T00:00:00Z,purchased_at.lt.2027-01-01T00:00:00Z)",
    );
  });

  it("exports one client company for a firm: bookkeeping.csv, owner-folder files, stamped after upload", async () => {
    const ORG = "33333333-3333-4333-8333-333333333333";
    const STAFF = "44444444-4444-4444-8444-444444444444";
    state.rows = [row(1, { organization_id: ORG }), row(2, { organization_id: ORG, status: "pending_review" })];
    state.files[`receipts/${USER_ID}/img1.jpg`] = new Uint8Array(100);
    state.files[`receipts/${USER_ID}/img2.jpg`] = new Uint8Array(100);
    const now = new Date("2026-11-05T09:00:00Z");

    const res = await buildExport({
      scope: { kind: "organization", organizationId: ORG },
      actorUserId: STAFF,
      period: { kind: "month", month: "2026-10" },
      unexportedOnly: true,
      markExported: true,
      now,
    });

    expect(res.receiptCount).toBe(2);
    expect(res.missing).toBe(0);
    expect(state.eqs).toEqual([["organization_id", ORG], ["status", "verified"]]);
    expect(state.isNull).toEqual(["exported_at"]);
    // The ZIP belongs to the staff member, keyed by client.
    expect(state.uploads[0].path.startsWith(`${STAFF}/${ORG}-`)).toBe(true);
    // Only the ready receipt is stamped (after the upload): the one still
    // in review must show up again once it is completed.
    expect(state.stamps).toEqual([
      {
        payload: { exported_at: now.toISOString(), exported_by: STAFF },
        ids: [row(1).id],
      },
    ]);
  });

  it("does not stamp when the upload fails", async () => {
    const ORG = "33333333-3333-4333-8333-333333333333";
    state.rows = [row(1, { organization_id: ORG })];
    state.uploadError = { message: "disk full" };
    await expect(
      buildExport({
        scope: { kind: "organization", organizationId: ORG },
        actorUserId: USER_ID,
        period: { kind: "all" },
        markExported: true,
      })
    ).rejects.toThrow(/upload failed/);
    expect(state.stamps).toEqual([]);
  });
});
