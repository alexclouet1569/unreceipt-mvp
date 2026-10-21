// POST /api/claims/pdf { month: "YYYY-MM" } — the printable expense claim
// for /app/claims: a summary page plus every receipt photo, numbered.
// Built by buildClaimPdf() into the private `exports` bucket; returns a
// short-lived signed URL, never the PDF itself (Vercel caps a function
// response at 4.5 MB and a month of photos is more).
//
// Gated like capture: it's a product feature. Cancelled customers still
// get their data through /api/export. Rate-limited because each call
// downloads every photo of the month and writes to storage.

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import {
  hasProductAccess,
  subscriptionRequiredResponse,
} from "@/lib/subscription-gate";
import { parseClaimMonth } from "@/lib/claims/claim";
import { getI18n } from "@/lib/i18n/server";
import {
  ClaimTooLargeError,
  MAX_CLAIM_RECEIPTS,
  buildClaimPdf,
} from "@/lib/claims/claim-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function personName(userId: string, email: string | undefined): Promise<string> {
  const { data } = await getSupabaseAdmin()
    .from("profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();
  const name = (data as { full_name?: string | null } | null)?.full_name?.trim();
  return name || email || "";
}

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
  const month = parseClaimMonth((raw as { month?: unknown } | null)?.month);
  if (!month) {
    return NextResponse.json({ error: "invalid month" }, { status: 400 });
  }

  if (!(await hasProductAccess(user.id))) {
    return subscriptionRequiredResponse();
  }

  const limited = await rateLimit("claimPdf", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  const { locale, t } = await getI18n();
  try {
    const result = await buildClaimPdf(user.id, month, await personName(user.id, user.email), locale);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ClaimTooLargeError) {
      return NextResponse.json(
        { error: t.claims.pdf.tooManyReceipts(MAX_CLAIM_RECEIPTS) },
        { status: 413 },
      );
    }
    console.error("[/api/claims/pdf] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "claim-pdf" } });
    return NextResponse.json(
      { error: t.claims.pdfFailed },
      { status: 500 },
    );
  }
}
