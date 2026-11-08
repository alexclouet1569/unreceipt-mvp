// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => storage } }),
}));

import { cleanupStagedPhotos, isOwnStagedPath, stagedType } from "@/lib/receipts/staging";

const USER = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";

describe("staged photos", () => {
  it("accepts only the user's own staged files", () => {
    expect(isOwnStagedPath(USER, `${USER}/staged/${FILE}.jpg`)).toBe(true);
    expect(isOwnStagedPath(USER, `${USER}/staged/${FILE}.pdf`)).toBe(true);
    expect(isOwnStagedPath(USER, `${FILE}/staged/${FILE}.jpg`)).toBe(false);
    expect(isOwnStagedPath(USER, `${USER}/${FILE}.jpg`)).toBe(false);
    expect(isOwnStagedPath(USER, `${USER}/staged/${FILE}.jpg/../x`)).toBe(false);
    expect(isOwnStagedPath("not-a-uuid.*", `not-a-uuid.*/staged/${FILE}.jpg`)).toBe(false);
    expect(stagedType(`${USER}/staged/${FILE}.webp`)).toBe("image/webp");
  });

  it("deletes staged photos older than a day, and nothing else", async () => {
    const now = new Date("2026-11-08T12:00:00Z");
    storage.list.mockImplementation(async (folder: string) => {
      if (folder === "") return { data: [{ name: USER, id: null }], error: null };
      if (folder === `${USER}/staged`)
        return {
          data: [
            { name: "old.jpg", id: "1", created_at: "2026-11-07T10:00:00Z" },
            { name: "new.jpg", id: "2", created_at: "2026-11-08T11:00:00Z" },
          ],
          error: null,
        };
      return { data: [], error: null };
    });
    storage.remove.mockResolvedValue({ error: null });

    expect(await cleanupStagedPhotos(now)).toEqual({ removed: 1 });
    expect(storage.remove).toHaveBeenCalledWith([`${USER}/staged/old.jpg`]);
  });
});
