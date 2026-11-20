// SERVER-ONLY. The booking agent's daily upkeep (/api/cron/accounting):
//
//   * settles proposals left mid-way (reconcileProposal: an abandoned
//     approval is posted, a lost answer is looked up in Fortnox by its
//     marker before anything else, a file not attached is attached);
//   * renews the refresh token of connections idle for 30 days (Fortnox's
//     lives 45 and only a refresh renews it);
//   * deletes expired connect flows.

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { deleteExpiredAccountingPending } from "./oauth";
import { proposalsNeedingAttention } from "./proposals";
import { reconcileProposal } from "./service";
import { supabaseTokenStore } from "./store";
import { getAccessToken } from "./tokens";

const IDLE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

export type AccountingMaintenanceResult = {
  reconciled: Record<string, number>;
  reconcileErrors: number;
  refreshed: number;
  refreshErrors: number;
  pendingDeleted: number;
};

export async function runAccountingMaintenance(opts: { deadline: number; now?: number }): Promise<AccountingMaintenanceResult> {
  const now = opts.now ?? Date.now();
  const result: AccountingMaintenanceResult = {
    reconciled: {},
    reconcileErrors: 0,
    refreshed: 0,
    refreshErrors: 0,
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

  const { data: idle, error } = await getSupabaseAdmin()
    .from("accounting_connections")
    .select("id")
    .eq("status", "active")
    .lt("refreshed_at", new Date(now - IDLE_REFRESH_MS).toISOString())
    .limit(200);
  if (error) throw new Error(`idle connections read failed (${error.code ?? "unknown"})`);
  for (const conn of idle ?? []) {
    if (Date.now() > opts.deadline) break;
    try {
      await getAccessToken(conn.id as string, { store: supabaseTokenStore(), forceRefresh: true });
      result.refreshed += 1;
    } catch (err) {
      result.refreshErrors += 1;
      Sentry.captureException(err, { tags: { area: "accounting", step: "idle_refresh" } });
    }
  }

  result.pendingDeleted = await deleteExpiredAccountingPending(getSupabaseAdmin(), now);
  return result;
}
