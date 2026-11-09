// SERVER-ONLY. A client company's bank lines were imported by its
// accounting firm, for that firm's check. When the link ends (either side
// revokes it, or the firm closes) they go too: the old firm can't reach
// them any more, the client has no screen for them, and the next firm
// must not inherit another firm's statement and decisions.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function deleteBankLines(
  supabase: SupabaseClient,
  organizationIds: string[]
): Promise<{ ok: boolean }> {
  if (organizationIds.length === 0) return { ok: true };
  // The firm's reminder log for the company ends with the link too
  // (client_reminders, 2026-11-09).
  for (const table of ["bank_transactions", "client_reminders"]) {
    const { error } = await supabase.from(table).delete().in("organization_id", organizationIds);
    if (error) {
      console.error(`[bank] ${table} delete on link end failed`, error.code);
      return { ok: false };
    }
  }
  return { ok: true };
}
