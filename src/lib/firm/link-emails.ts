// SERVER-ONLY. The emails a client company gets when an accounting firm
// starts seeing its receipts (whichever side sent the invite) and when a
// firm stops because it closed its account. A security notice as much as a
// receipt: if the client didn't agree, the email points to Settings → Stop
// sharing. Best effort: a failure is logged, never thrown.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail, founderReplyTo } from "@/lib/email/send";
import * as Sentry from "@sentry/nextjs";
import { firmClosedEmail, linkConfirmationEmail } from "@/lib/email/templates";
import { absoluteAppUrl } from "@/lib/app-url";

export async function sendLinkConfirmation(opts: {
  clientUserId: string;
  firmId: string;
}): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const [{ data: firm }, { data: userRes }] = await Promise.all([
      db.from("firms").select("name").eq("id", opts.firmId).maybeSingle(),
      db.auth.admin.getUserById(opts.clientUserId),
    ]);
    const to = userRes?.user?.email;
    if (!to) return;
    const content = linkConfirmationEmail({
      firmName: (firm?.name as string | undefined) ?? "Your accounting firm",
      settingsUrl: absoluteAppUrl("/app/settings"),
    });
    const sent = await sendEmail({ to, ...content, replyTo: founderReplyTo(), tag: "link_confirmation" });
    if (!sent.ok) console.error("[link-emails] confirmation not sent", sent.reason);
  } catch (err) {
    console.error("[link-emails] confirmation failed", err);
  }
}

// Total time the firm-closed notices may take: they run at the end of an
// account deletion inside a 60 s function (/api/account/delete).
export const FIRM_CLOSED_BUDGET_MS = 15_000;
// Resend allows a few requests per second; a pause keeps a firm with many
// clients from getting rejected for rate.
const SEND_GAP_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tells every owner of each client company that `firmName` closed its
 * account and the link has ended. Called once the account is deleted
 * (deleteAccount(), src/lib/firm/account-exit.ts); the addresses are read
 * from the companies' memberships, never from the request. Stops starting
 * new sends after FIRM_CLOSED_BUDGET_MS; anything not sent is counted as
 * failed and reported to Sentry (no ids or addresses).
 */
export async function sendFirmClosedNotices(opts: {
  firmName: string;
  organizationIds: string[];
  budgetMs?: number;
}): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  if (opts.organizationIds.length === 0) return result;
  const deadline = Date.now() + (opts.budgetMs ?? FIRM_CLOSED_BUDGET_MS);
  try {
    const db = getSupabaseAdmin();
    const { data: owners, error } = await db
      .from("memberships")
      .select("user_id")
      .in("organization_id", opts.organizationIds)
      .eq("role", "owner");
    if (error) throw new Error(`owner lookup failed (${error.code})`);
    const userIds = [...new Set((owners ?? []).map((o) => o.user_id as string))];
    const content = firmClosedEmail({ firmName: opts.firmName, settingsUrl: absoluteAppUrl("/app/settings") });
    for (const [i, userId] of userIds.entries()) {
      if (Date.now() >= deadline) {
        result.failed += userIds.length - i;
        break;
      }
      if (i > 0) await sleep(SEND_GAP_MS);
      const { data: userRes, error: userError } = await db.auth.admin.getUserById(userId);
      const to = userRes?.user?.email;
      if (userError || !to) {
        result.failed++;
        continue;
      }
      const sent = await sendEmail({ to, ...content, replyTo: founderReplyTo(), tag: "firm_closed" });
      if (sent.ok) result.sent++;
      else {
        result.failed++;
        console.error("[link-emails] firm-closed notice not sent", sent.reason);
      }
    }
  } catch (err) {
    result.failed++;
    console.error("[link-emails] firm-closed notices failed", err);
    Sentry.captureException(err, { tags: { area: "firm-closed-email" } });
    return result;
  }
  if (result.failed > 0) {
    Sentry.captureMessage("firm-closed notices incomplete", {
      level: "warning",
      tags: { area: "firm-closed-email" },
    });
  }
  return result;
}
