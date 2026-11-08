// SERVER-ONLY. "Staged" receipt photos: the capture sheet's photo, stored by
// /api/ocr while it reads it, so Save doesn't send the same photo from the
// phone a second time (0.3-1.5 s on mobile data). /api/capture moves it to
// the receipt's own path; one never saved is deleted by the daily cleanup
// (STAGED_TTL_HOURS). It lives under the user's own folder in `receipts`,
// so account deletion (USER_FILE_BUCKETS) removes it like any other file.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { EXTENSION_BY_TYPE, type AllowedUploadType } from "@/lib/receipts/upload-limits";

export const STAGING_BUCKET = "receipts";
const STAGED_DIR = "staged";
export const STAGED_TTL_HOURS = 24;
const PAGE = 1000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSIONS = Object.values(EXTENSION_BY_TYPE).join("|");

export function stagedPathFor(userId: string, type: AllowedUploadType): string {
  return `${userId}/${STAGED_DIR}/${crypto.randomUUID()}.${EXTENSION_BY_TYPE[type]}`;
}

/**
 * A staged path this user may claim: their own folder, our naming, nothing
 * else (no `..`, no other user's id). The path comes from the client.
 */
export function isOwnStagedPath(userId: string, path: string): boolean {
  if (!new RegExp(`^${UUID}$`, "i").test(userId)) return false;
  return new RegExp(`^${userId}/${STAGED_DIR}/${UUID}\\.(${EXTENSIONS})$`, "i").test(path);
}

/** The upload type of a staged path, from its extension. */
export function stagedType(path: string): AllowedUploadType | null {
  const ext = path.split(".").pop()?.toLowerCase();
  const match = Object.entries(EXTENSION_BY_TYPE).find(([, e]) => e === ext);
  return match ? (match[0] as AllowedUploadType) : null;
}

/** Deletes staged photos older than STAGED_TTL_HOURS. Daily cron. */
export async function cleanupStagedPhotos(now: Date = new Date()): Promise<{ removed: number }> {
  const storage = getSupabaseAdmin().storage.from(STAGING_BUCKET);
  const cutoff = now.getTime() - STAGED_TTL_HOURS * 60 * 60 * 1000;
  let removed = 0;

  const users: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list("", { limit: PAGE, offset });
    if (error) throw new Error("receipts list failed");
    for (const entry of data ?? []) if (entry.id == null) users.push(entry.name);
    if ((data ?? []).length < PAGE) break;
  }

  for (const user of users) {
    const folder = `${user}/${STAGED_DIR}`;
    const stale: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(folder, { limit: PAGE, offset });
      if (error) throw new Error("staged list failed");
      for (const entry of data ?? []) {
        const created = Date.parse(entry.created_at ?? "");
        if (entry.id != null && Number.isFinite(created) && created < cutoff) {
          stale.push(`${folder}/${entry.name}`);
        }
      }
      if ((data ?? []).length < PAGE) break;
    }
    for (let i = 0; i < stale.length; i += 100) {
      const { error } = await storage.remove(stale.slice(i, i + 100));
      if (error) throw new Error("staged remove failed");
      removed += Math.min(100, stale.length - i);
    }
  }
  return { removed };
}
