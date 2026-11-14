// SERVER-ONLY. "Anything new?" for the website's receipts list and the
// iPhone app (GET /api/receipts/updates), asked every ~20 s while the
// screen is open, so a receipt that arrives by email shows up without a
// manual refresh. Kept cheap: three small indexed reads of the user's own
// rows (count, newest created_at, newest updated_at), scoped by user_id
// like the home list (src/lib/home/load-home.ts).
//
// `version` changes whenever a receipt is added, changed (anywhere: the
// email intake, the other device, the accountant) or deleted; the client
// reloads its list only then. `fresh` lists the receipts that came in by
// email (forwarding or a connected mailbox) after the client's `after`
// cursor, a receipt's own created_at (never the client's clock), for the
// "N new receipts from your email" notice.

import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** At most this many new receipts are named in one answer. */
export const FRESH_LIMIT = 20;

export type ReceiptUpdates = {
  version: string;
  /** created_at of the user's newest receipt (the notice's first cursor), null with no receipts. */
  latestCreatedAt: string | null;
  /** Email receipts created after `after`, newest first (none without `after`). */
  fresh: { id: string; createdAt: string }[];
};

export class ReceiptUpdatesError extends Error {}

/** A created_at the client got from us: an ISO timestamp, nothing else. */
export function parseAfter(value: string | null): string | null {
  if (!value || value.length > 40) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export async function loadReceiptUpdates(userId: string, after: string | null): Promise<ReceiptUpdates> {
  const db = getSupabaseAdmin();
  const own = () => db.from("receipts").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const [counted, created, updated, fresh] = await Promise.all([
    own(),
    db.from("receipts").select("created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
    db
      .from("receipts")
      .select("updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1),
    after
      ? db
          .from("receipts")
          .select("id, created_at")
          .eq("user_id", userId)
          .eq("source", "email")
          .gt("created_at", after)
          .order("created_at", { ascending: false })
          .limit(FRESH_LIMIT)
      : Promise.resolve({ data: [] as { id: string; created_at: string }[], error: null }),
  ]);
  const failed = counted.error ?? created.error ?? updated.error ?? fresh.error;
  if (failed) throw new ReceiptUpdatesError(failed.message);

  const latestCreatedAt = (created.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
  const latestUpdatedAt = (updated.data?.[0] as { updated_at?: string | null } | undefined)?.updated_at ?? null;
  return {
    version: `${counted.count ?? 0}|${latestCreatedAt ?? ""}|${latestUpdatedAt ?? ""}`,
    latestCreatedAt,
    fresh: ((fresh.data ?? []) as { id: string; created_at: string }[]).map((r) => ({ id: r.id, createdAt: r.created_at })),
  };
}
