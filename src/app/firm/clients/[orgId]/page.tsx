import { requireFirmClientAccess, requireFirmMemberPage, FirmAuthError } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { monthBounds, printedMonthFilter, receiptMonth, resolveMonth } from "@/lib/firm/client-stats";
import type { Receipt } from "@/lib/types";
import { ClientView } from "../../_views";
import { notFound } from "next/navigation";
import { ensureHomeAmounts, homeCurrencyOf } from "@/lib/fx";
import { loadBankMonth } from "@/lib/bank/load";
import type { ReminderState } from "./ReminderSwitch";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

// Every receipt of the client printed in the month (printed-day.ts), and
// those still without a date that arrived in it, newest first. Scoped by the organisation id that requireFirmClientAccess()
// returned; nothing else may scope this query.
async function loadMonthReceipts(organizationId: string, month: string): Promise<Receipt[]> {
  const { from, to } = monthBounds(month);
  const db = getSupabaseAdmin();
  const [dated, undated] = await Promise.all([
    db
      .from("receipts")
      .select("*")
      .eq("organization_id", organizationId)
      .or(printedMonthFilter(month))
      .order("purchased_at", { ascending: false })
      .limit(MAX_ROWS),
    // Rows still waiting for a date (review needed) sort by creation time.
    db
      .from("receipts")
      .select("*")
      .eq("organization_id", organizationId)
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
async function loadReminderState(firmClientId: string, firmId: string, organizationId: string): Promise<ReminderState> {
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

  const [loaded, home, reminders] = await Promise.all([
    loadMonthReceipts(access.organizationId, month),
    homeCurrencyOf(access.organizationId),
    loadReminderState(access.firmClientId, ctx.firmId, access.organizationId),
  ]);
  // The client's own currency next to foreign amounts (src/lib/fx.ts).
  const [bank, receipts] = await Promise.all([
    loadBankMonth(access.organizationId, month, home),
    ensureHomeAmounts(loaded, home).catch((err) => {
      console.error("[/firm/clients/[orgId]] currency conversion failed", err);
      return loaded;
    }),
  ]);

  return (
    <ClientView
      clientName={access.clientName}
      organizationId={access.organizationId}
      month={month}
      receipts={receipts}
      bank={bank}
      reminders={reminders}
      hrefs={{
        back: `/firm/clients?month=${month}`,
        month: (m) => `/firm/clients/${access.organizationId}?month=${m}`,
      }}
    />
  );
}
