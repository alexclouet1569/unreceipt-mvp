// GET /api/team/approvals — the receipts waiting for the caller's decision
// (owners and approvers), oldest first: { items: ApprovalQueueItem[] }.
// Website and iPhone app alike (cookie or bearer).

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { loadApprovalQueue } from "@/lib/team/decisions";
import { NO_STORE, teamGuard } from "@/lib/team/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await teamGuard(request, { write: false, limit: "receiptUpdates" });
  if (!guard.ok) return guard.response;
  try {
    const items = await loadApprovalQueue(guard.user.id);
    return NextResponse.json({ items }, { headers: NO_STORE });
  } catch (err) {
    console.error("[/api/team/approvals] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "team" } });
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
