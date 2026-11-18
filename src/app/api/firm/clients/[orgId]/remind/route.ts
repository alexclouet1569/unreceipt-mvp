// POST /api/firm/clients/[orgId]/remind — "Send a reminder now" to one client
// company (src/lib/reminders/now.ts): the Monday email, sent at once. Firm
// member first (requireFirmMember; cookie on the website, bearer in the
// iPhone app), then the client must be linked to the session's firm
// (requireFirmClientAccess: 404 otherwise), same-origin, rate limited per
// company (clientRemindNow). 409 when the client turned reminders off or
// there is nothing to ask.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { isSameHost } from "@/lib/same-origin";
import {
  FirmAuthError,
  firmAuthResponse,
  requireFirmClientAccess,
  requireFirmMember,
} from "@/lib/require-firm";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { sendReminderNow } from "@/lib/reminders/now";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MESSAGES = {
  opted_out: { status: 409, message: "This client turned reminders off in their settings." },
  nothing_to_ask: { status: 409, message: "Nothing to ask: no missing receipts or receipts to complete." },
  no_recipient: { status: 409, message: "The client has no confirmed email address to send to." },
  failed: { status: 500, message: "Couldn't send the reminder. Try again." },
} as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let ctx;
  let access;
  try {
    ctx = await requireFirmMember();
    access = await requireFirmClientAccess(ctx.firmId, (await params).orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const limited = await rateLimit("clientRemindNow", access.organizationId);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const result = await sendReminderNow({
      firmId: ctx.firmId,
      firmName: ctx.firmName,
      firmCountry: ctx.firmCountry ?? null,
      firmClientId: access.firmClientId,
      organizationId: access.organizationId,
      clientName: access.clientName,
    });
    if (result.ok) return NextResponse.json({ ok: true, recipients: result.recipients });
    const m = MESSAGES[result.reason];
    return NextResponse.json({ error: result.reason, message: m.message }, { status: m.status });
  } catch (err) {
    console.error("[/api/firm/clients/[orgId]/remind] failed", err instanceof Error ? err.message : "error");
    Sentry.captureException(err, { tags: { area: "reminder now" } });
    return NextResponse.json({ error: "failed", message: MESSAGES.failed.message }, { status: 500 });
  }
}
