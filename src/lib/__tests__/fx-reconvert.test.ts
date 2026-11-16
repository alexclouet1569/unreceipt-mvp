// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/types";

// A receipts table the reconversion pages through by id.
const m = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; organization_id: string; total: number | null; home_currency: string | null; home_total: number | null }>,
  calls: [] as Array<{ after: string | null; limit: number }>,
  failRead: false,
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = {
        org: "",
        home: "",
        after: null as string | null,
        max: 0,
        select: () => q,
        eq: (_c: string, v: string) => ((q.org = v), q),
        not: () => q,
        or: (f: string) => ((q.home = /neq\.([A-Z]{3})/.exec(f)?.[1] ?? ""), q),
        order: () => q,
        gt: (_c: string, v: string) => ((q.after = v), q),
        limit: (n: number) => ((q.max = n), q),
        then: (resolve: (r: unknown) => void) => {
          m.calls.push({ after: q.after, limit: q.max });
          if (m.failRead) return resolve({ data: null, error: { code: "XX000" } });
          const data = m.rows
            .filter((r) => r.organization_id === q.org && r.total != null)
            .filter((r) => r.home_currency !== q.home || r.home_total == null)
            .filter((r) => q.after == null || r.id > q.after)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, q.max);
          resolve({ data, error: null });
        },
      };
      return q;
    },
  }),
}));

const { reconvertOrganization } = await import("@/lib/fx");

const row = (id: string, home_currency: string | null, org = "org-1") => ({
  id: id.padStart(4, "0"),
  organization_id: org,
  total: 100,
  home_currency,
  home_total: home_currency ? 100 : null,
});

beforeEach(() => {
  m.rows = [];
  m.calls = [];
  m.failRead = false;
});

describe("reconvertOrganization", () => {
  it("converts every receipt of the company not yet in the new currency, page by page", async () => {
    m.rows = [
      ...Array.from({ length: 1200 }, (_, i) => row(String(i), "SEK")),
      row("1300", "EUR"), // already in the new currency
      row("1400", "SEK", "org-2"), // another company
    ];
    const converted: string[] = [];
    const convert = vi.fn(async (rows: Receipt[], home: string) => {
      expect(home).toBe("EUR");
      converted.push(...rows.map((r) => r.id));
      return rows;
    });
    const result = await reconvertOrganization("org-1", "EUR", Date.now() + 10_000, convert);
    expect(result).toEqual({ done: true, seen: 1200 });
    expect(convert).toHaveBeenCalledTimes(3);
    expect(new Set(converted).size).toBe(1200);
    expect(converted).not.toContain("1300");
    expect(converted).not.toContain("1400");
  });

  it("passes a receipt that can't be converted once, without looping on it", async () => {
    // Nothing gets converted (no rate): keyset paging still ends.
    m.rows = Array.from({ length: 501 }, (_, i) => row(String(i), null));
    const convert = vi.fn(async (rows: Receipt[]) => rows);
    const result = await reconvertOrganization("org-1", "EUR", Date.now() + 10_000, convert);
    expect(result).toEqual({ done: true, seen: 501 });
    expect(m.calls.map((c) => c.after)).toEqual([null, "0499"]);
  });

  it("stops at the deadline and leaves the rest to be converted on read", async () => {
    m.rows = Array.from({ length: 600 }, (_, i) => row(String(i), "SEK"));
    const convert = vi.fn(async (rows: Receipt[]) => rows);
    const result = await reconvertOrganization("org-1", "EUR", Date.now() - 1, convert);
    expect(result).toEqual({ done: false, seen: 0 });
    expect(convert).not.toHaveBeenCalled();
  });

  it("throws on a failed read, so the caller can report it", async () => {
    m.failRead = true;
    await expect(reconvertOrganization("org-1", "EUR", Date.now() + 10_000, vi.fn())).rejects.toThrow("XX000");
  });
});
