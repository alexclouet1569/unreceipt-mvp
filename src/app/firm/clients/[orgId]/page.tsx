import { requireFirmClientAccess, requireFirmMemberPage, FirmAuthError } from "@/lib/require-firm";
import { resolveMonth } from "@/lib/firm/client-stats";
import { loadClientMonthReceipts, loadReminderState } from "@/lib/firm/portal-load";
import { ClientView } from "../../_views";
import { notFound } from "next/navigation";
import { ensureHomeAmounts, homeCurrencyOf } from "@/lib/fx";
import { loadBankMonth } from "@/lib/bank/load";

export const dynamic = "force-dynamic";

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
    loadClientMonthReceipts(access.organizationId, month),
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
