// POST /api/export { period: "YYYY-MM" | "all" } — the accountant export
// (launch plan action 45): a ZIP with receipts.csv, the PDFs and the
// original files, built by buildExport() into the private `exports` bucket.
// Returns short-lived signed download URLs, never the ZIP itself (Vercel
// caps a function response at 4.5 MB).
//
// No subscription check on purpose: customers must be able to take their
// receipts with them after cancelling (privacy page: 90 days to download).
// Rate-limited because each export renders PDFs and writes to storage.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  ExportTooLargeError,
  MAX_EXPORT_RECEIPTS,
  buildExport,
  parsePeriod,
} from "@/lib/export/build-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Rendering a PDF per receipt plus downloads: allow the Hobby maximum.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const period = parsePeriod((raw as { period?: unknown } | null)?.period);
  if (!period) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  const limited = await rateLimit("export", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const result = await buildExport(user.id, period);
    return NextResponse.json({
      receiptCount: result.receiptCount,
      missing: result.missing,
      parts: result.parts.map(({ filename, url, bytes }) => ({ filename, url, bytes })),
    });
  } catch (err) {
    if (err instanceof ExportTooLargeError) {
      return NextResponse.json(
        {
          error: `There are more than ${MAX_EXPORT_RECEIPTS} receipts in this period. Export one year or one month at a time.`,
        },
        { status: 413 },
      );
    }
    console.error("[/api/export] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "export" } });
    return NextResponse.json(
      { error: "Couldn't create the export. Please try again." },
      { status: 500 },
    );
  }
}
