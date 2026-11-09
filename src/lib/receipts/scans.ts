// Where an uploaded multi-page scan is kept whole (receipt-originals,
// under the user's own folder so account deletion removes it), and which
// paths a client may point a page receipt at. The path comes from the
// client, so it is checked like a staged photo (src/lib/receipts/staging.ts).

export const SCAN_BUCKET = "receipt-originals";
export const MAX_SCAN_PAGES = 50;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function scanPathFor(userId: string): string {
  return `${userId}/scans/${crypto.randomUUID()}.pdf`;
}

export function isOwnScanPath(userId: string, path: string): boolean {
  if (!new RegExp(`^${UUID}$`, "i").test(userId)) return false;
  const prefix = `${userId}/scans/`;
  return path.startsWith(prefix) && new RegExp(`^${UUID}\\.pdf$`).test(path.slice(prefix.length));
}

/** A scan shared by several page receipts: never deleted with just one of them. */
export function isScanPath(path: string): boolean {
  return /^[^/]+\/scans\/[^/]+\.pdf$/.test(path);
}

// A stored scan no receipt points at (every page was "not a receipt", the
// split failed, or the sheet was closed before a page was saved) is
// reachable nowhere: the daily cleanup removes it after a day. The batch
// sheet tells the client to keep their own copy in that case.
export const ORPHAN_SCAN_TTL_HOURS = 24;
const PAGE = 1000;

/** Deletes stored scans older than a day that no receipt references. Daily cron. */
export async function cleanupOrphanScans(now: Date = new Date()): Promise<{ removed: number }> {
  const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
  const db = getSupabaseAdmin();
  const storage = db.storage.from(SCAN_BUCKET);
  const cutoff = now.getTime() - ORPHAN_SCAN_TTL_HOURS * 60 * 60 * 1000;
  let removed = 0;

  const users: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list("", { limit: PAGE, offset });
    if (error) throw new Error("originals list failed");
    for (const entry of data ?? []) if (entry.id == null) users.push(entry.name);
    if ((data ?? []).length < PAGE) break;
  }

  for (const user of users) {
    const folder = `${user}/scans`;
    const old: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(folder, { limit: PAGE, offset });
      if (error) throw new Error("scans list failed");
      for (const entry of data ?? []) {
        const created = Date.parse(entry.created_at ?? "");
        if (entry.id != null && Number.isFinite(created) && created < cutoff) old.push(`${folder}/${entry.name}`);
      }
      if ((data ?? []).length < PAGE) break;
    }
    for (let i = 0; i < old.length; i += 100) {
      const chunk = old.slice(i, i + 100);
      const { data: used, error } = await db.from("receipts").select("original_source_url").in("original_source_url", chunk);
      if (error) throw new Error(`scan reference check failed (${error.code})`);
      const referenced = new Set((used ?? []).map((r) => r.original_source_url as string));
      const orphans = chunk.filter((p) => !referenced.has(p));
      if (orphans.length === 0) continue;
      const { error: removeError } = await storage.remove(orphans);
      if (removeError) throw new Error("scan remove failed");
      removed += orphans.length;
    }
  }
  return { removed };
}
