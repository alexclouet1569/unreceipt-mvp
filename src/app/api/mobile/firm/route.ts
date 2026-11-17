// GET /api/mobile/firm?month=YYYY-MM — the iPhone app's Clients tab: the
// firm, its clients with the month's counts, invites still waiting, and the
// firm's join link with its QR code. The same loaders as /firm/clients
// (src/lib/firm/portal-load.ts): the firm comes from the session
// (requireFirmMember; the app's bearer), counts only cover receipts the firm
// may see (firmVisible). Rate limited like the app's other list reads.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { FirmAuthError, firmAuthResponse, requireFirmMember } from "@/lib/require-firm";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { resolveMonth } from "@/lib/firm/client-stats";
import { loadClientStats, loadFirmClients } from "@/lib/firm/portal-load";
import { ensureJoinCode, joinPath } from "@/lib/firm/join-link";
import { joinQrDataUrl } from "@/lib/firm/join-qr";
import { absoluteAppUrl } from "@/lib/app-url";
import type { MobileFirmHome } from "@/lib/mobile/types";
import { CLIENT_GUIDE_PATH, recommendEmail } from "@/lib/firm/recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireFirmMember();
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }
  const limited = await rateLimit("analytics", ctx.user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const month = resolveMonth(new URL(request.url).searchParams.get("month") ?? undefined);
  try {
    const [{ active, pending }, join] = await Promise.all([loadFirmClients(ctx.firmId), ensureJoinCode(ctx.firmId)]);
    const stats = await loadClientStats(
      active.map((c) => c.organization_id),
      month,
    );
    const url = join.code ? absoluteAppUrl(joinPath(join.code)) : null;
    const body: MobileFirmHome = {
      firmName: ctx.firmName,
      role: ctx.role,
      month,
      clients: active.map((c) => {
        const st = stats.get(c.organization_id);
        return {
          organizationId: c.organization_id,
          name: c.client_name,
          orgNumber: c.client_org_number,
          total: st?.total ?? 0,
          reviewNeeded: st?.reviewNeeded ?? 0,
          ready: st?.ready ?? 0,
          exported: st?.exported ?? 0,
          newThisWeek: st?.newThisWeek ?? 0,
          lastReceiptAt: st?.lastReceiptAt ?? null,
        };
      }),
      pending: pending.map((p) => ({
        id: p.id,
        name: p.client_name,
        email: p.invited_email,
        invitedAt: p.created_at,
        expired: p.expired,
      })),
      joinLink: url
        ? {
            url,
            qr: await joinQrDataUrl(url),
            // The same ready Swedish email as on /firm/clients.
            recommend: recommendEmail({ firmName: ctx.firmName, joinUrl: url, guideUrl: absoluteAppUrl(CLIENT_GUIDE_PATH) }),
          }
        : null,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/firm] failed", err instanceof Error ? err.message : "error");
    Sentry.captureException(err, { tags: { area: "mobile firm" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
