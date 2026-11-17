import { requireFirmMemberPage } from "@/lib/require-firm";
import { normalizedSessionEmail } from "@/lib/email-address";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveMonth } from "@/lib/firm/client-stats";
import { loadClientStats, loadFirmClients } from "@/lib/firm/portal-load";
import { ClientsView } from "../_views";
import { FirmRequests, type FirmRequest } from "./FirmRequests";
import { absoluteAppUrl } from "@/lib/app-url";
import { ensureJoinCode, joinPath } from "@/lib/firm/join-link";
import { joinQrDataUrl } from "@/lib/firm/join-qr";
import { CLIENT_GUIDE_PATH, recommendEmail } from "@/lib/firm/recommend";

export const dynamic = "force-dynamic";

// Client companies that invited the signed-in accountant by this exact,
// confirmed address (direction 'client'). Only that person may answer.
async function loadRequests(email: string | null): Promise<FirmRequest[]> {
  if (!email) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .select("id, client_name")
    .eq("direction", "client")
    .eq("status", "invited")
    .eq("invited_email", email)
    .gt("invite_expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[/firm/clients] requests load failed", error.code);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    clientName: r.client_name as string,
  }));
}

export default async function FirmClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireFirmMemberPage();
  const { month: requested } = await searchParams;
  const month = resolveMonth(requested);

  // Normalised like the stored invite address (Gmail dots, googlemail.com).
  const confirmedEmail = normalizedSessionEmail(ctx.user);
  const [{ active, pending }, requests, join] = await Promise.all([
    loadFirmClients(ctx.firmId),
    loadRequests(confirmedEmail),
    ensureJoinCode(ctx.firmId),
  ]);
  const joinUrl = join.code ? absoluteAppUrl(joinPath(join.code)) : null;
  const stats = await loadClientStats(
    active.map((c) => c.organization_id),
    month,
  );

  return (
    <>
      <FirmRequests requests={requests} />
      <ClientsView
        active={active}
        pending={pending}
        stats={stats}
        month={month}
        hrefs={{
          month: (m) => `/firm/clients?month=${m}`,
          client: (orgId, m) => `/firm/clients/${orgId}?month=${m}`,
        }}
        joinLink={{
          url: joinUrl,
          qr: joinUrl ? await joinQrDataUrl(joinUrl) : null,
          off: join.off,
          isAdmin: ctx.role === "admin",
          recommend: joinUrl
            ? recommendEmail({ firmName: ctx.firmName, joinUrl, guideUrl: absoluteAppUrl(CLIENT_GUIDE_PATH) })
            : null,
        }}
      />
    </>
  );
}
