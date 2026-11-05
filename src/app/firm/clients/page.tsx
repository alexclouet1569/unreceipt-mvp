import { requireFirmMemberPage } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  computeClientStats,
  monthBounds,
  resolveMonth,
  type ClientStats,
  type StatRow,
} from "@/lib/firm/client-stats";
import type { FirmClient } from "@/lib/types";
import { ClientsView, type ActiveClient, type PendingInvite } from "../_views";

export const dynamic = "force-dynamic";

async function loadClients(firmId: string): Promise<{
  active: ActiveClient[];
  pending: PendingInvite[];
}> {
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select(
      "id, organization_id, status, client_name, client_org_number, invited_email, invite_expires_at, created_at"
    )
    .eq("firm_id", firmId)
    .in("status", ["active", "invited"])
    .order("client_name", { ascending: true });
  if (error) {
    console.error("[/firm/clients] load failed", error);
    return { active: [], pending: [] };
  }
  const rows = (data ?? []) as FirmClient[];
  return {
    active: rows.filter(
      (r): r is FirmClient & { organization_id: string } =>
        r.status === "active" && typeof r.organization_id === "string"
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

// One query for every active client: receipts in the month (with slack)
// plus anything created in the last 7 days, aggregated in memory.
async function loadStats(
  organizationIds: string[],
  month: string
): Promise<Map<string, ClientStats>> {
  if (organizationIds.length === 0) return new Map();
  const { from, to } = monthBounds(month);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();
  const cols = "organization_id, status, exported_at, created_at, purchased_at";
  const [inMonth, recent] = await Promise.all([
    supabase
      .from("receipts")
      .select(cols)
      .in("organization_id", organizationIds)
      .gte("purchased_at", from)
      .lt("purchased_at", to),
    supabase
      .from("receipts")
      .select(cols)
      .in("organization_id", organizationIds)
      .gte("created_at", weekAgo),
  ]);
  if (inMonth.error || recent.error) {
    console.error("[/firm/clients] stats failed", inMonth.error ?? recent.error);
    return new Map();
  }
  // Dedupe by created_at + org (rows have no id in this projection; a
  // receipt both in the month and recent is the same row twice).
  const seen = new Set<string>();
  const rows: StatRow[] = [];
  for (const r of [...(inMonth.data ?? []), ...(recent.data ?? [])] as StatRow[]) {
    const key = `${r.organization_id}|${r.created_at}|${r.purchased_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return computeClientStats(rows, month);
}

export default async function FirmClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireFirmMemberPage();
  const { month: requested } = await searchParams;
  const month = resolveMonth(requested);

  const { active, pending } = await loadClients(ctx.firmId);
  const stats = await loadStats(
    active.map((c) => c.organization_id),
    month
  );

  return (
    <ClientsView
      active={active}
      pending={pending}
      stats={stats}
      month={month}
      hrefs={{
        month: (m) => `/firm/clients?month=${m}`,
        client: (orgId, m) => `/firm/clients/${orgId}?month=${m}`,
      }}
    />
  );
}
