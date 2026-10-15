// SERVER-ONLY. Removes accountant exports older than EXPORT_TTL_HOURS from
// the private `exports` bucket (layout: exports/<user_id>/<file>.zip).

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { EXPORT_BUCKET, EXPORT_TTL_HOURS } from "./build-export";

const PAGE = 1000;

export async function cleanupExports(now: Date = new Date()): Promise<{ removed: number }> {
  const storage = getSupabaseAdmin().storage.from(EXPORT_BUCKET);
  const cutoff = now.getTime() - EXPORT_TTL_HOURS * 60 * 60 * 1000;
  let removed = 0;

  const folders: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list("", { limit: PAGE, offset });
    if (error) throw new Error("exports list failed");
    for (const entry of data ?? []) if (entry.id == null) folders.push(entry.name);
    if ((data ?? []).length < PAGE) break;
  }

  for (const folder of folders) {
    const stale: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(folder, { limit: PAGE, offset });
      if (error) throw new Error("exports list failed");
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
      if (error) throw new Error("exports remove failed");
      removed += Math.min(100, stale.length - i);
    }
  }
  return { removed };
}
