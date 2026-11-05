// POST /api/firm/clients/[orgId]/export { period, unexportedOnly?, markExported? }
// — a firm exports one client company's receipts for bookkeeping: the
// usual ZIP plus bookkeeping.csv (one line per receipt and VAT rate).
// By default only receipts never exported before, stamped as exported once
// the upload succeeded. The organisation id is checked against the
// session firm's active links before anything is read.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  ExportTooLargeError,
  MAX_EXPORT_RECEIPTS,
  buildExport,
  parsePeriod,
} from "@/lib/export/build-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  period: z.unknown(),
  unexportedOnly: z.boolean().optional(),
  markExported: z.boolean().optional(),
});

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
  if (!parsed.success) return NextResponse.json({ error: "invalid json" }, { status: 400 });
  const period = parsePeriod(parsed.data.period);
  if (!period) return NextResponse.json({ error: "invalid period" }, { status: 400 });

  const { orgId } = await params;
  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const limited = await rateLimit("firmExport", ctx.user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const result = await buildExport({
      scope: { kind: "organization", organizationId: access.organizationId },
      actorUserId: ctx.user.id,
      period,
      unexportedOnly: parsed.data.unexportedOnly ?? true,
      markExported: parsed.data.markExported ?? true,
    });
    return NextResponse.json({
      receiptCount: result.receiptCount,
      missing: result.missing,
      parts: result.parts.map(({ filename, url, bytes }) => ({ filename, url, bytes })),
    });
  } catch (err) {
    if (err instanceof ExportTooLargeError) {
      return NextResponse.json(
        { error: `There are more than ${MAX_EXPORT_RECEIPTS} receipts in this period. Export one month at a time.` },
        { status: 413 }
      );
    }
    console.error("[/api/firm/clients/[orgId]/export] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "firm-export" } });
    return NextResponse.json({ error: "Couldn't create the export. Please try again." }, { status: 500 });
  }
}
