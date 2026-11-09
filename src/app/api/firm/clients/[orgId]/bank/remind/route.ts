// POST /api/firm/clients/[orgId]/bank/remind { month } — emails the client
// company's owners the month's bank payments that have no receipt, with
// the accountant as Reply-To, and stamps those lines reminded_at. The
// addresses come from the company's memberships, never from the request;
// the list is computed here, not sent by the browser. Rate-limited per
// company. Scoped by the organisation that requireFirmClientAccess()
// returned.

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { homeCurrencyOf } from "@/lib/fx";
import { loadBankMonth } from "@/lib/bank/load";
import { dayLabel } from "@/lib/bank/month";
import { monthLabel } from "@/lib/firm/client-stats";
import { formatAmount } from "@/lib/receipt-format";
import { sendEmail } from "@/lib/email/send";
import { missingReceiptsEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const origin = request.headers.get("origin");
  if (origin && !isSameHost(origin, request.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let ctx;
  try {
    ctx = await requireFirmMember();
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { month } = parsed.data;

  const { orgId } = await params;
  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const home = await homeCurrencyOf(access.organizationId);
  const view = await loadBankMonth(access.organizationId, month, home);
  if (!view) return NextResponse.json({ error: "Couldn't read the bank lines. Try again." }, { status: 500 });
  const missing = view.lines.filter((l) => l.state.kind === "missing");
  if (missing.length === 0) {
    return NextResponse.json({ error: "Nothing is missing this month." }, { status: 409 });
  }

  const limited = await rateLimit("bankReminder", access.organizationId);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "This client was already emailed several times today. Try again tomorrow." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const db = getSupabaseAdmin();
  const { data: owners, error: ownersError } = await db
    .from("memberships")
    .select("user_id")
    .eq("organization_id", access.organizationId)
    .eq("role", "owner");
  if (ownersError) {
    console.error("[/api/firm/clients/[orgId]/bank/remind] owner lookup failed", ownersError.code);
    return NextResponse.json({ error: "Couldn't send the email. Try again." }, { status: 500 });
  }

  const content = missingReceiptsEmail({
    firmName: ctx.firmName,
    clientName: access.clientName,
    monthLabel: monthLabel(month),
    lines: missing.map((l) => ({
      day: dayLabel(l.bookedOn),
      description: l.description,
      amount: formatAmount(-l.amount, l.currency),
    })),
    total: view.missingTotals.map((t) => formatAmount(t.amount, t.currency)).join(" + "),
    appUrl: appUrl("/app"),
  });
  const replyTo = ctx.user.email && ctx.user.email_confirmed_at ? ctx.user.email : null;

  let sent = 0;
  for (const userId of [...new Set((owners ?? []).map((o) => o.user_id as string))]) {
    const { data: userRes } = await db.auth.admin.getUserById(userId);
    const to = userRes?.user?.email;
    if (!to) continue;
    const result = await sendEmail({ to, ...content, replyTo, tag: "missing_receipts" });
    if (result.ok) sent++;
    else console.error("[/api/firm/clients/[orgId]/bank/remind] not sent", result.reason);
  }
  if (sent === 0) {
    Sentry.captureMessage("missing-receipts email not sent", { level: "warning", tags: { area: "bank-remind" } });
    return NextResponse.json({ error: "Couldn't send the email. Try again later." }, { status: 502 });
  }

  // For the pilot dashboard (/admin/pilot): counts only, no contents.
  const { error: logError } = await db.from("client_reminders").insert({
    organization_id: access.organizationId,
    firm_id: ctx.firmId,
    kind: "manual",
    missing_count: missing.length,
    recipients: sent,
  });
  if (logError) console.error("[/api/firm/clients/[orgId]/bank/remind] log failed", logError.code);

  // In chunks: the ids go in the request URL.
  const remindedAt = new Date().toISOString();
  const ids = missing.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error: stampError } = await db
      .from("bank_transactions")
      .update({ reminded_at: remindedAt })
      .eq("organization_id", access.organizationId)
      .in("id", ids.slice(i, i + 100));
    if (stampError) console.error("[/api/firm/clients/[orgId]/bank/remind] stamp failed", stampError.code);
  }

  return NextResponse.json({ ok: true, sent, lines: missing.length, remindedAt });
}
