import { requireFirmClientAccess, requireFirmMemberPage, FirmAuthError } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { monthBounds, receiptMonth, resolveMonth } from "@/lib/firm/client-stats";
import type { Receipt } from "@/lib/types";
import { ClientView } from "../../_views";
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

  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) notFound();
    throw err;
  }

  const receipts = await loadMonthReceipts(access.organizationId, month);

  return (
    <ClientView
      clientName={access.clientName}
      organizationId={access.organizationId}
      month={month}
      receipts={receipts}
      hrefs={{
        back: `/firm/clients?month=${month}`,
        month: (m) => `/firm/clients/${access.organizationId}?month=${m}`,
      }}
    />
  );
}
