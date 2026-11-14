// Daily (vercel.json): deletes accountant exports older than
// EXPORT_TTL_HOURS. Their signed links expired long before; the ZIPs are
// copies of data we keep anyway, so there's no reason to hold them.
// Also deletes Gmail forwarding confirmation codes older than 7 days
// (src/lib/forwarding-confirmation-cleanup.ts), and capture-sheet photos
// stored while being read but never saved (src/lib/receipts/staging.ts),
// and "Connect Gmail/Outlook" flows that were started but never finished
// (mailbox_oauth_pending rows past their 10-minute expiry), and iPhone app
// grants nobody claimed (mailbox_oauth_parked past its 10 minutes, revoked
// at the provider, src/lib/mailboxes/parked.ts).

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { cleanupExports } from "@/lib/export/cleanup";
import { cleanupForwardingConfirmations } from "@/lib/forwarding-confirmation-cleanup";
import { cleanupStagedPhotos } from "@/lib/receipts/staging";
import { cleanupOrphanScans } from "@/lib/receipts/scans";
import { deleteExpiredPending } from "@/lib/mailboxes/oauth";
import { deleteExpiredParked } from "@/lib/mailboxes/parked";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Independent of the export cleanup: a failure here is reported, not fatal.
  let forwardingConfirmationsDeleted: number | null = null;
  try {
    forwardingConfirmationsDeleted = (await cleanupForwardingConfirmations()).deleted;
  } catch (err) {
    console.error("[cron/cleanup-exports] confirmation cleanup failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "forwarding-confirmation-cleanup" } });
  }
  // Exports first: they are copies of receipt data promised gone after 24 h.
  let exportResult: Awaited<ReturnType<typeof cleanupExports>> | null = null;
  try {
    exportResult = await cleanupExports();
  } catch (err) {
    console.error("[cron/cleanup-exports] failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "export-cleanup" } });
  }
  let stagedPhotosDeleted: number | null = null;
  try {
    stagedPhotosDeleted = (await cleanupStagedPhotos()).removed;
  } catch (err) {
    console.error("[cron/cleanup-exports] staged photo cleanup failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "staged-photo-cleanup" } });
  }
  let orphanScansDeleted: number | null = null;
  try {
    orphanScansDeleted = (await cleanupOrphanScans()).removed;
  } catch (err) {
    console.error("[cron/cleanup-exports] orphan scan cleanup failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "orphan-scan-cleanup" } });
  }
  let mailboxFlowsDeleted: number | null = null;
  try {
    mailboxFlowsDeleted = await deleteExpiredPending(getSupabaseAdmin());
  } catch (err) {
    console.error("[cron/cleanup-exports] mailbox flow cleanup failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "mailbox-pending-cleanup" } });
  }
  let mailboxGrantsDeleted: number | null = null;
  try {
    mailboxGrantsDeleted = await deleteExpiredParked(getSupabaseAdmin());
  } catch (err) {
    console.error("[cron/cleanup-exports] parked mailbox cleanup failed", err instanceof Error ? err.message : "unknown");
    Sentry.captureException(err, { tags: { area: "mailbox-parked-cleanup" } });
  }
  if (!exportResult) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({
    ...exportResult,
    forwardingConfirmationsDeleted,
    stagedPhotosDeleted,
    orphanScansDeleted,
    mailboxFlowsDeleted,
    mailboxGrantsDeleted,
  });
}
