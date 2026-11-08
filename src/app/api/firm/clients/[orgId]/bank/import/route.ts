// POST /api/firm/clients/[orgId]/bank/import { csv, filename? } — the firm
// imports a client company's bank statement (CSV from the internet bank).
// Lines already imported are skipped (dedupe_key), so the same file or an
// overlapping one can be imported again. Matching to receipts happens on
// read (src/lib/bank/month.ts). Scoped by the organisation that
// requireFirmClientAccess() returned.

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { isSameHost } from "@/lib/same-origin";
import { FirmAuthError, firmAuthResponse, requireFirmClientAccess, requireFirmMember } from "@/lib/require-firm";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { homeCurrencyOf } from "@/lib/fx";
import { dedupeSources, parseBankStatement } from "@/lib/bank/parse-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// A year of a busy company's card payments is well under 1 MB of CSV.
export const MAX_CSV_CHARS = 2_000_000;
const CHUNK = 500;

const BodySchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_CHARS),
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

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_CSV_CHARS * 2) {
    return NextResponse.json({ error: "The file is too large. Export one month or one quarter at a time." }, { status: 413 });
  }

  const limited = await rateLimit("bankImport", ctx.user.id);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many imports. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a CSV file exported from the bank." }, { status: 400 });
  }

  const { orgId } = await params;
  let access;
  try {
    access = await requireFirmClientAccess(ctx.firmId, orgId);
  } catch (err) {
    if (err instanceof FirmAuthError) return firmAuthResponse(err);
    throw err;
  }

  const statement = parseBankStatement(parsed.data.csv);
  if (!statement.ok) {
    return NextResponse.json({ error: statement.error }, { status: 422 });
  }

  const home = await homeCurrencyOf(access.organizationId);
  const keys = dedupeSources(statement.rows, home);
  const now = new Date().toISOString();
  const rows = statement.rows.map((r, i) => ({
    organization_id: access.organizationId,
    booked_on: r.bookedOn,
    amount: r.amount,
    currency: r.currency ?? home,
    description: r.description,
    dedupe_key: createHash("sha256").update(keys[i]).digest("hex"),
    imported_by: ctx.user.id,
    imported_at: now,
  }));

  let imported = 0;
  const db = getSupabaseAdmin();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await db
      .from("bank_transactions")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[/api/firm/clients/[orgId]/bank/import] insert failed", error.code);
      Sentry.captureException(new Error(`bank import insert failed (${error.code})`), { tags: { area: "bank-import" } });
      return NextResponse.json(
        { error: "Couldn't save the bank lines. Try again.", imported },
        { status: 500 }
      );
    }
    imported += (data ?? []).length;
  }

  const days = statement.rows.map((r) => r.bookedOn).sort();
  return NextResponse.json({
    ok: true,
    lines: statement.rows.length,
    imported,
    duplicates: statement.rows.length - imported,
    skipped: statement.skipped,
    from: days[0],
    to: days[days.length - 1],
    months: [...new Set(days.map((d) => d.slice(0, 7)))],
  });
}
