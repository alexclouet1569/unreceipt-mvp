import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { requireFirmClientAccess, requireFirmMemberPage, FirmAuthError } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  adjacentMonths,
  monthBounds,
  monthLabel,
  receiptMonth,
  resolveMonth,
} from "@/lib/firm/client-stats";
import type { Receipt } from "@/lib/types";
import { FirmReceiptList } from "./FirmReceiptList";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

// Every receipt of the client dated in the month (Stockholm time), newest
// first. Scoped by the organisation id that requireFirmClientAccess()
// returned; nothing else may scope this query.
async function loadMonthReceipts(organizationId: string, month: string): Promise<Receipt[]> {
  const { from, to } = monthBounds(month);
  const db = getSupabaseAdmin();
  const [dated, undated] = await Promise.all([
    db
      .from("receipts")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("purchased_at", from)
      .lt("purchased_at", to)
      .order("purchased_at", { ascending: false })
      .limit(MAX_ROWS),
    // Rows still waiting for a date (review needed) sort by creation time.
    db
      .from("receipts")
      .select("*")
      .eq("organization_id", organizationId)
      .is("purchased_at", null)
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

export default async function FirmClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireFirmMemberPage();
  const { orgId } = await params;
  const { month: requested } = await searchParams;
  const month = resolveMonth(requested);
  const { prev, next } = adjacentMonths(month);

  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) notFound();
    throw err;
  }

  const receipts = await loadMonthReceipts(access.organizationId, month);

  const link =
    "inline-flex items-center justify-center rounded-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href={`/firm/clients?month=${month}`} aria-label="Back to clients" className={link} style={{ width: "44px", height: "44px" }}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1
              className="font-display font-bold text-[var(--ink)]"
              style={{ fontSize: "22px", letterSpacing: "-0.01em" }}
            >
              {access.clientName}
            </h1>
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
              {receipts.length === 0
                ? `No receipts in ${monthLabel(month)}.`
                : `${receipts.length} receipt${receipts.length === 1 ? "" : "s"} in ${monthLabel(month)}.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/firm/clients/${access.organizationId}?month=${prev}`} aria-label="Previous month" className={link} style={{ width: "44px", height: "44px" }}>
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <span className="font-display font-bold text-[var(--ink)] min-w-[9rem] text-center" style={{ fontSize: "15px" }}>
            {monthLabel(month)}
          </span>
          <Link href={`/firm/clients/${access.organizationId}?month=${next}`} aria-label="Next month" className={link} style={{ width: "44px", height: "44px" }}>
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </div>

      <FirmReceiptList receipts={receipts} />
    </div>
  );
}
