// SERVER-ONLY. Account deletion: the Fortnox connection of the user's own
// company goes with the company (ON DELETE CASCADE). A Fortnox service
// account holds no token on our side, so there is nothing to give back here:
// without the row, UnReceipt can't ask for a token for that company any more.
// The company removes UnReceipt in Fortnox → Integrationer to end the
// consent on Fortnox's side too (the disconnect screen says so).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Deletes the own company's Fortnox connection first; never throws. Returns how many. */
export async function disconnectAccountingFor(userId: string, supabase: SupabaseClient): Promise<number> {
  try {
    const { data: orgs, error } = await supabase.from("organizations").select("id").eq("default_for_user_id", userId);
    if (error || !orgs?.length) return 0;
    const { data, error: delError } = await supabase
      .from("accounting_connections")
      .delete()
      .in(
        "organization_id",
        orgs.map((o) => o.id as string),
      )
      .select("id");
    if (delError) return 0;
    return (data ?? []).length;
  } catch {
    return 0;
  }
}
