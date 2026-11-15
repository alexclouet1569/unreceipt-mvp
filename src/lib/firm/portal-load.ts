// SERVER-ONLY. What the accounting-firm portal reads about its clients,
// shared by the website (/firm/clients, /firm/clients/[orgId]) and the
// iPhone app's Clients tab (/api/mobile/firm/*): the firm's clients and
// waiting invites, per-client counts for a month, one client's receipts of a
// month and its reminder state. Every client query is scoped by an
// organisation id the caller got from requireFirmClientAccess() (or the
// firm's own active links), and every receipt read goes through
// firmVisible() (src/lib/firm/visibility.ts): a mailbox receipt the owner
// hasn't confirmed is never the firm's to see.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { firmVisible } from "@/lib/firm/visibility";
import {
  computeClientStats,
  monthBounds,
  printedMonthFilter,
  receiptMonth,
  type ClientStats,
  type StatRow,
} from "@/lib/firm/client-stats";
import type { FirmClient, Receipt } from "@/lib/types";

export type ActiveClient = Pick<FirmClient, "id" | "client_name" | "client_org_number"> & { organization_id: string };

export type PendingInvite = Pick<
  FirmClient,
  "id" | "client_name" | "invited_email" | "invite_expires_at" | "created_at"
> & { expired: boolean };

export type ReminderState = {
  weekly: boolean;
  // The client turned weekly reminders off in its own settings: nothing
  // is sent whatever the firm's switch says.
  clientOptedOut: boolean;
  // The latest reminder email of either kind, if any.
  lastSentAt: string | null;
};

export async function loadFirmClients(firmId: string): Promise<{
  active: ActiveClient[];
  pending: PendingInvite[];
}> {
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select(
      "id, organization_id, status, client_name, client_org_number, invited_email, invite_expires_at, created_at",
    )
    .eq("firm_id", firmId)
    .in("status", ["active", "invited"])
    .order("client_name", { ascending: true });
  if (error) {
    console.error("[firm portal] clients load failed", error.code);
    return { active: [], pending: [] };
  }
  const rows = (data ?? []) as FirmClient[];
  return {
    active: rows.filter(
      (r): r is FirmClient & { organization_id: string } =>
        r.status === "active" && typeof r.organization_id === "string",
    ),
    pending: rows
      .filter((r) => r.status === "invited")
      .map((r) => ({
        ...r,
        expired:
          typeof r.invite_expires_at === "string" &&
          Date.parse(r.invite_expires_at) < Date.now(),
      })),
  };
}


// One query for every active client (receipts the firm may see, see
// src/lib/firm/visibility.ts): receipts in the month (with slack)
// plus anything created in the last 7 days, aggregated in memory.
export async function loadClientStats(
  organizationIds: string[],
  month: string,
): Promise<Map<string, ClientStats>> {
  if (organizationIds.length === 0) return new Map();
  const { from, to } = monthBounds(month);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();
  const cols = "organization_id, status, exported_at, created_at, purchased_at, receipt_date";
  const [inMonth, undated, recent] = await Promise.all([
    firmVisible(
      supabase
        .from("receipts")
        .select(cols)
        .in("organization_id", organizationIds)
    )
      .or(printedMonthFilter(month)),
    // Still without a date: counted in the month they arrived (receiptMonth()).
    firmVisible(
      supabase
        .from("receipts")
        .select(cols)
        .in("organization_id", organizationIds)
    )
      .is("receipt_date", null)
      .is("purchased_at", null)
      .gte("created_at", from)
      .lt("created_at", to),
    firmVisible(
      supabase
        .from("receipts")
        .select(cols)
        .in("organization_id", organizationIds)
    )
      .gte("created_at", weekAgo),
  ]);
  if (inMonth.error || undated.error || recent.error) {
    console.error(
      "[/firm/clients] stats failed",
      inMonth.error ?? undated.error ?? recent.error,
    );
    return new Map();
  }
  // Dedupe by created_at + org (rows have no id in this projection; a
  // receipt both in the month and recent is the same row twice).
  const seen = new Set<string>();
  const rows: StatRow[] = [];
  for (const r of [
    ...(inMonth.data ?? []),
    ...(undated.data ?? []),
    ...(recent.data ?? []),
  ] as StatRow[]) {
    const key = `${r.organization_id}|${r.created_at}|${r.purchased_at}|${r.receipt_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return computeClientStats(rows, month);
}


const MAX_ROWS = 500;

// Every receipt of the client printed in the month (printed-day.ts), and
// those still without a date that arrived in it, newest first. Scoped by the organisation id that requireFirmClientAccess()
// returned; nothing else may scope this query. Mailbox receipts the owner
// hasn't confirmed are left out (src/lib/firm/visibility.ts).
export async function loadClientMonthReceipts(organizationId: string, month: string): Promise<Receipt[]> {
  const { from, to } = monthBounds(month);
  const db = getSupabaseAdmin();
  const [dated, undated] = await Promise.all([
    firmVisible(
      db
        .from("receipts")
        .select("*")
        .eq("organization_id", organizationId)
    )
      .or(printedMonthFilter(month))
      .order("purchased_at", { ascending: false })
      .limit(MAX_ROWS),
    // Rows still waiting for a date (review needed) sort by creation time.
    firmVisible(
      db
        .from("receipts")
        .select("*")
        .eq("organization_id", organizationId)
    )
      .is("purchased_at", null)
      .is("receipt_date", null)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
  ]);
  if (dated.error || undated.error) {
    console.error("[/firm/clients/[orgId]] load failed", dated.error ?? undated.error);
    return [];
  }
  const rows = [...((dated.data ?? []) as Receipt[]), ...((undated.data ?? []) as Receipt[])];
  return rows.filter((r) => receiptMonth(r) === month);
}

// The link's weekly-reminder switch and the latest reminder sent. Read
// failures fall back to "on, never sent" (the default) and are logged.
export async function loadReminderState(firmClientId: string, firmId: string, organizationId: string): Promise<ReminderState> {
  const db = getSupabaseAdmin();
  const [link, last] = await Promise.all([
    db.from("firm_clients").select("weekly_reminder, reminders_opted_out_at").eq("id", firmClientId).maybeSingle(),
    db
      .from("client_reminders")
      .select("sent_at")
      .eq("organization_id", organizationId)
      // This firm's reminders only: an earlier firm's aren't its business.
      .eq("firm_id", firmId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (link.error || last.error) {
    console.error("[/firm/clients/[orgId]] reminder state failed", (link.error ?? last.error)?.code);
  }
  return {
    weekly: link.data?.weekly_reminder !== false,
    clientOptedOut: Boolean(link.data?.reminders_opted_out_at),
    lastSentAt: typeof last.data?.sent_at === "string" ? last.data.sent_at : null,
  };
}

