// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tree: {
    "": [{ name: "user-a", id: null }],
    "user-a": [
      { name: "old.zip", id: "1", created_at: "2026-10-13T00:00:00Z" },
      { name: "new.zip", id: "2", created_at: "2026-10-15T08:00:00Z" },
    ],
  } as Record<string, Array<{ name: string; id: string | null; created_at?: string }>>,
  removed: [] as string[][],
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        list: async (folder: string) => ({ data: state.tree[folder] ?? [], error: null }),
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { error: null };
        },
      }),
    },
  }),
}));

import { cleanupExports } from "@/lib/export/cleanup";

describe("cleanupExports", () => {
  it("removes exports older than 24 hours only", async () => {
    const res = await cleanupExports(new Date("2026-10-15T09:00:00Z"));
    expect(res).toEqual({ removed: 1 });
    expect(state.removed).toEqual([["user-a/old.zip"]]);
  });
});
