// SERVER-ONLY. Account deletion: the Fortnox connection of the user's own
// company goes with the company (ON DELETE CASCADE), but the grant at
// Fortnox would stay. This gives it back first, best effort (never throws):
// a Fortnox that is down leaves a grant the company's administrator can
// remove under Fortnox → Integrationer.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountingConnection } from "@/lib/types";
import { decryptAccountingToken } from "./crypto";
import { revokeRefreshToken } from "./fortnox/oauth";

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
      .select("organization_id, refresh_token_enc");
    if (delError) return 0;
    const rows = (data ?? []) as Pick<AccountingConnection, "organization_id" | "refresh_token_enc">[];
    await Promise.all(
      rows.map(async (row) => {
        try {
          await revokeRefreshToken(decryptAccountingToken(row.refresh_token_enc, row.organization_id));
        } catch {
          // Unreadable token: nothing to revoke.
        }
      }),
    );
    return rows.length;
  } catch {
    return 0;
  }
}
