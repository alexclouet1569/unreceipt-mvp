// GET /api/mobile/receipts/[id] — the iPhone app's digital receipt: every
// field the paper copy shows (items, VAT, payment, stamp), for one receipt
// of the signed-in user. Same access rules and rate limit as the home list
// and Insights; owner only (firm staff use /firm on the web); converted to
// the company's currency like the list.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { analyticsAccess } from "@/lib/analytics/load";
import { ensureHomeAmounts } from "@/lib/fx";
import { toMobileReceiptDetail } from "@/lib/mobile/receipt";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import type { Receipt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }

  const limited = await rateLimit("analytics", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  try {
    const [access, read] = await Promise.all([
      analyticsAccess(user),
      getSupabaseAdmin().from("receipts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    ]);
    if (access.kind !== "ready") {
      return NextResponse.json({ error: access.kind }, { status: 403, headers: NO_STORE });
    }
    if (read.error) throw read.error;
    if (!read.data) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    const [row] = await ensureHomeAmounts([read.data as Receipt], access.home).catch(() => [read.data as Receipt]);
    return NextResponse.json(toMobileReceiptDetail(row), { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/receipts/:id] failed", err);
    Sentry.captureException(err, { tags: { area: "mobile receipt detail" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
