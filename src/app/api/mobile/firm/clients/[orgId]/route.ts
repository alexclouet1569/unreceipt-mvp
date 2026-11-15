// GET /api/mobile/firm/clients/<orgId>?month=YYYY-MM — one client's month on
// the iPhone app's Clients tab: its receipts the firm may see (firmVisible:
// a mailbox receipt only once the owner confirmed it), converted to the
// client's currency, as display JSON, and its reminder state. The firm comes
// from the session (requireFirmMember, the app's bearer) and the client must
// be linked to it (requireFirmClientAccess: 404 otherwise, like one that
// doesn't exist). The same loaders as /firm/clients/[orgId]
// (src/lib/firm/portal-load.ts).

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import {
  FirmAuthError,
  firmAuthResponse,
  requireFirmClientAccess,
  requireFirmMember,
} from "@/lib/require-firm";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { resolveMonth } from "@/lib/firm/client-stats";
import { loadClientMonthReceipts, loadReminderState } from "@/lib/firm/portal-load";
import { ensureHomeAmounts, homeCurrencyOf } from "@/lib/fx";
import { toMobileReceipt } from "@/lib/mobile/receipt";
import type { MobileFirmClientMonth } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  let ctx;
  let access;
  try {
    ctx = await requireFirmMember();
    access = await requireFirmClientAccess(ctx.firmId, (await params).orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }
  const limited = await rateLimit("analytics", ctx.user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const month = resolveMonth(new URL(request.url).searchParams.get("month") ?? undefined);
  try {
    const [loaded, home, reminders] = await Promise.all([
      loadClientMonthReceipts(access.organizationId, month),
      homeCurrencyOf(access.organizationId),
      loadReminderState(access.firmClientId, ctx.firmId, access.organizationId),
    ]);
    const receipts = await ensureHomeAmounts(loaded, home).catch(() => loaded);
    const body: MobileFirmClientMonth = {
      organizationId: access.organizationId,
      clientName: access.clientName,
      month,
      receipts: receipts.map(toMobileReceipt),
      reminders,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/firm/clients] failed", err instanceof Error ? err.message : "error");
    Sentry.captureException(err, { tags: { area: "mobile firm client" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
