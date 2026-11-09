// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: {} as Record<string, Array<{ name: string; id: string | null; created_at?: string }>>,
  referenced: [] as string[],
  removed: [] as string[],
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        list: async (folder: string) => ({ data: mocks.files[folder] ?? [], error: null }),
        remove: async (paths: string[]) => (mocks.removed.push(...paths), { error: null }),
      }),
    },
    from: () => ({
      select: () => ({
        in: async (_c: string, paths: string[]) => ({
          data: paths.filter((p) => mocks.referenced.includes(p)).map((p) => ({ original_source_url: p })),
          error: null,
        }),
      }),
    }),
  }),
}));

import { cleanupOrphanScans, isOwnScanPath, isScanPath } from "../scans";

const U = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222222";
const S2 = "33333333-3333-4333-8333-333333333333";
const S3 = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-10T12:00:00Z");

beforeEach(() => {
  mocks.files = {
    "": [{ name: U, id: null }],
    [`${U}/scans`]: [
      { name: `${S1}.pdf`, id: "a", created_at: "2026-11-08T10:00:00Z" },
      { name: `${S2}.pdf`, id: "b", created_at: "2026-11-08T10:00:00Z" },
      // Too new: the batch may still be running.
      { name: `${S3}.pdf`, id: "c", created_at: "2026-11-10T11:00:00Z" },
    ],
  };
  mocks.referenced = [`${U}/scans/${S1}.pdf`];
  mocks.removed = [];
});

describe("scan paths", () => {
  it("accepts only the user's own scans folder and our naming", () => {
    expect(isOwnScanPath(U, `${U}/scans/${S1}.pdf`)).toBe(true);
    expect(isOwnScanPath(U, `${S2}/scans/${S1}.pdf`)).toBe(false);
    expect(isOwnScanPath(U, `${U}/scans/../${S1}.pdf`)).toBe(false);
    expect(isOwnScanPath(U, `${U}/scans/${S1}.jpg`)).toBe(false);
    expect(isScanPath(`${U}/scans/${S1}.pdf`)).toBe(true);
    expect(isScanPath(`${U}/${S1}.pdf`)).toBe(false);
  });
});

describe("cleanupOrphanScans", () => {
  it("removes day-old scans no receipt points at, and nothing else", async () => {
    expect(await cleanupOrphanScans(NOW)).toEqual({ removed: 1 });
    expect(mocks.removed).toEqual([`${U}/scans/${S2}.pdf`]);
  });
});
