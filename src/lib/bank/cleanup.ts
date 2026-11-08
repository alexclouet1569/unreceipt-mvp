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
  const { error } = await supabase
    .from("bank_transactions")
    .delete()
    .in("organization_id", organizationIds);
  if (error) {
    console.error("[bank] delete on link end failed", error.code);
    return { ok: false };
  }
  return { ok: true };
}
