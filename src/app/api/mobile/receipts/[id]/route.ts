// GET /api/mobile/receipts/[id] — the iPhone app's digital receipt: every
// field the paper copy shows (items, VAT, payment, stamp). The owner, under
// the home list's and Insights' access rules, or (since 2026-11-15, the
// app's Clients tab) staff of the accounting firm linked to the receipt's
// company, through loadReceiptForActor() exactly as the website's receipt
// sheet: a mailbox receipt only once confirmed, a 404 for anything the
// caller may not see, no plan gate for the firm (firm portal rule 3).
// Converted to the company's currency like the list.

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase-server";
import { analyticsAccess } from "@/lib/analytics/load";
import { ensureHomeAmounts, homeCurrencyOf } from "@/lib/fx";
import { loadReceiptForActor } from "@/lib/receipts/access";
import { toMobileReceiptDetail } from "@/lib/mobile/receipt";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

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
    const found = await loadReceiptForActor(user, id);
    if (!found) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    let home: string;
    if (found.via === "owner") {
      const access = await analyticsAccess(user);
      if (access.kind !== "ready") {
        return NextResponse.json({ error: access.kind }, { status: 403, headers: NO_STORE });
      }
      home = access.home;
    } else {
      // The client company's own currency, as on the firm's client page.
      home = await homeCurrencyOf(found.receipt.organization_id as string);
    }
    const [row] = await ensureHomeAmounts([found.receipt], home).catch(() => [found.receipt]);
    return NextResponse.json(toMobileReceiptDetail(row), { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/mobile/receipts/:id] failed", err);
    Sentry.captureException(err, { tags: { area: "mobile receipt detail" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
