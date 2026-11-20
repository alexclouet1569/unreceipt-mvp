// SERVER-ONLY. The booking agent's daily upkeep (/api/cron/accounting):
//
//   * settles proposals left mid-way (reconcileProposal: an abandoned
//     approval is posted, a lost answer is looked up in Fortnox by its
//     marker before anything else, a file not attached is attached);
//   * deletes expired connect flows.

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { deleteExpiredAccountingPending } from "./oauth";
import { proposalsNeedingAttention } from "./proposals";
import { reconcileProposal } from "./service";

export type AccountingMaintenanceResult = {
  reconciled: Record<string, number>;
  reconcileErrors: number;
  pendingDeleted: number;
};

export async function runAccountingMaintenance(opts: { deadline: number; now?: number }): Promise<AccountingMaintenanceResult> {
  const now = opts.now ?? Date.now();
  const result: AccountingMaintenanceResult = {
    reconciled: {},
    reconcileErrors: 0,
    pendingDeleted: 0,
  };

  const rows = await proposalsNeedingAttention(new Date(now - 60_000).toISOString());
  for (const row of rows) {
    if (Date.now() > opts.deadline) break;
    try {
      const outcome = await reconcileProposal(row);
      result.reconciled[outcome] = (result.reconciled[outcome] ?? 0) + 1;
    } catch (err) {
      result.reconcileErrors += 1;
      Sentry.captureException(err, { tags: { area: "accounting", step: "reconcile" } });
    }
  }

  result.pendingDeleted = await deleteExpiredAccountingPending(getSupabaseAdmin(), now);
  return result;
}
