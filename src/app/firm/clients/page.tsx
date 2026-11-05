import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireFirmMemberPage } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  adjacentMonths,
  computeClientStats,
  EMPTY_STATS,
  monthBounds,
  monthLabel,
  resolveMonth,
  type ClientStats,
  type StatRow,
} from "@/lib/firm/client-stats";
import { formatDate } from "@/lib/receipt-format";
import type { FirmClient } from "@/lib/types";

export const dynamic = "force-dynamic";

type ActiveClient = Pick<
  FirmClient,
  "id" | "organization_id" | "client_name" | "client_org_number"
> & { organization_id: string };

type PendingInvite = Pick<
  FirmClient,
  "id" | "client_name" | "invited_email" | "invite_expires_at" | "created_at"
>;

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
    pending: rows.filter((r) => r.status === "invited"),
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
  const { prev, next } = adjacentMonths(month);

  const { active, pending } = await loadClients(ctx.firmId);
  const stats = await loadStats(
    active.map((c) => c.organization_id),
    month
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
          >
            Clients
          </h1>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            {active.length === 0
              ? "No client connected yet."
              : `${active.length} connected client${active.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <MonthSwitch month={month} prev={prev} next={next} />
      </div>

      {active.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--brand-tint)] px-5 py-8 text-center">
          <p className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
            Connect your first client
          </p>
          <p className="mt-1 text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            Invite a client company by email. Once they accept, their receipts
            appear here, month by month.
          </p>
        </div>
      ) : (
        <ClientTable active={active} stats={stats} month={month} />
      )}

      {pending.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
            Waiting for the client
          </h2>
          <ul className="divide-y divide-[var(--hairline)] rounded-[12px] border border-[var(--hairline)] bg-card">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-medium text-[var(--ink)]" style={{ fontSize: "14px" }}>
                  {p.client_name}
                </span>
                <span className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                  invited {formatDate(p.created_at)}
                  {p.invite_expires_at && Date.parse(p.invite_expires_at) < Date.now()
                    ? " · link expired"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MonthSwitch({ month, prev, next }: { month: string; prev: string; next: string }) {
  const link =
    "inline-flex items-center justify-center rounded-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors";
  return (
    <div className="flex items-center gap-1">
      <Link href={`/firm/clients?month=${prev}`} aria-label="Previous month" className={link} style={{ width: "44px", height: "44px" }}>
        <ChevronLeft className="w-5 h-5" />
      </Link>
      <span className="font-display font-bold text-[var(--ink)] min-w-[9rem] text-center" style={{ fontSize: "15px" }}>
        {monthLabel(month)}
      </span>
      <Link href={`/firm/clients?month=${next}`} aria-label="Next month" className={link} style={{ width: "44px", height: "44px" }}>
        <ChevronRight className="w-5 h-5" />
      </Link>
    </div>
  );
}

function ClientTable({
  active,
  stats,
  month,
}: {
  active: ActiveClient[];
  stats: Map<string, ClientStats>;
  month: string;
}) {
  const head = "px-4 py-2 text-left font-semibold text-[var(--ink-muted)]";
  const cell = "px-4 py-3";
  const num = "px-4 py-3 text-right font-mono tabular-nums";
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[var(--hairline)] bg-card">
      <table className="w-full" style={{ fontSize: "14px" }}>
        <thead className="border-b border-[var(--hairline)]" style={{ fontSize: "12px" }}>
          <tr>
            <th className={head}>Client</th>
            <th className={head + " text-right"}>New</th>
            <th className={head + " text-right"}>Review needed</th>
            <th className={head + " text-right"}>Ready</th>
            <th className={head + " text-right"}>Exported</th>
            <th className={head}>Last receipt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--hairline)]">
          {active.map((c) => {
            const s = stats.get(c.organization_id) ?? EMPTY_STATS;
            return (
              <tr key={c.id} className="hover:bg-[var(--brand-tint)]/40 transition-colors">
                <td className={cell}>
                  <Link
                    href={`/firm/clients/${c.organization_id}?month=${month}`}
                    className="font-medium text-[var(--ink)] hover:underline"
                  >
                    {c.client_name}
                  </Link>
                  {c.client_org_number ? (
                    <span className="ml-2 text-[var(--ink-muted)]" style={{ fontSize: "12px" }}>
                      {c.client_org_number}
                    </span>
                  ) : null}
                </td>
                <td className={num}>{s.newThisWeek}</td>
                <td className={num} style={s.reviewNeeded > 0 ? { color: "var(--attention-deep)" } : undefined}>
                  {s.reviewNeeded}
                </td>
                <td className={num}>{s.ready}</td>
                <td className={num}>{s.exported}</td>
                <td className={cell + " text-[var(--ink-muted)]"}>
                  {s.lastReceiptAt ? formatDate(s.lastReceiptAt) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
