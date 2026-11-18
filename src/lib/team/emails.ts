// SERVER-ONLY. The team's emails (2026-11-15): an invite, "receipts wait for
// you" to an approver, and "sent back / rejected" to the employee. Addresses
// come from the accounts (auth), never from a request. Best effort: a
// failed send is reported (src/lib/email/send.ts) and never fails the
// action that caused it.

import { getSupabaseAdmin } from "../supabase-admin";
import { sendEmail, founderReplyTo } from "../email/send";
import { approvalDecisionEmail, approvalRequestEmail, teamInviteEmail } from "../email/templates";
import { absoluteAppUrl, iosAppUrl } from "../app-url";
import { emailSiteLocale } from "../email/site-link";
import { chosenCountry } from "../country";
import { canDecide, type TeamMember } from "./rules";

export async function sendTeamInvite(opts: {
  to: string;
  companyName: string;
  inviterName: string;
  /** The company's country: which site the footer links to. */
  country?: string | null;
}): Promise<boolean> {
  try {
    const content = teamInviteEmail({
      site: emailSiteLocale({ country: opts.country ?? null, email: opts.to }),
      companyName: opts.companyName,
      inviterName: opts.inviterName,
      url: absoluteAppUrl("/app/team-join"),
      appUrl: iosAppUrl(),
    });
    const sent = await sendEmail({ to: opts.to, ...content, replyTo: founderReplyTo(), tag: "team_invite" });
    return sent.ok;
  } catch (err) {
    console.error("[team] invite email failed", err instanceof Error ? err.message : "unknown");
    return false;
  }
}

/**
 * Tells each approver that receipts wait for them, only when nothing was
 * already waiting for them before this one (one email when a pile starts,
 * not one per receipt).
 */
export async function notifyApprovers(opts: {
  organizationId: string;
  approvers: string[];
  employee: string;
  team: TeamMember[];
}): Promise<void> {
  const db = getSupabaseAdmin();
  for (const approverId of opts.approvers) {
    try {
      const theirs = opts.team.filter((m) => canDecide(approverId, m.userId, opts.team)).map((m) => m.userId);
      const { count, error } = await db
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", opts.organizationId)
        .eq("approval_status", "submitted")
        .in("user_id", theirs);
      // The receipt just sent is one of them: more than one means a pile already waited.
      if (error || (count ?? 0) > 1) continue;
      const { data } = await db.auth.admin.getUserById(approverId);
      const to = data?.user?.email;
      if (!to || !data?.user?.email_confirmed_at) continue;
      const content = approvalRequestEmail({
        employee: opts.employee,
        url: absoluteAppUrl("/app/team"),
        site: emailSiteLocale({ country: chosenCountry(data.user), email: to }),
      });
      await sendEmail({ to, ...content, tag: "approval_request" });
    } catch (err) {
      console.error("[team] approver email failed", err instanceof Error ? err.message : "unknown");
    }
  }
}

/** The employee's receipt was sent back or rejected: say so, with the approver's words. */
export async function notifyDecision(opts: {
  employeeId: string;
  decision: "sent_back" | "rejected";
  comment: string | null;
  merchant: string | null;
}): Promise<void> {
  try {
    const { data } = await getSupabaseAdmin().auth.admin.getUserById(opts.employeeId);
    const to = data?.user?.email;
    if (!to || !data?.user?.email_confirmed_at) return;
    const content = approvalDecisionEmail({
      site: emailSiteLocale({ country: chosenCountry(data.user), email: to }),
      decision: opts.decision,
      merchant: opts.merchant,
      comment: opts.comment,
      url: absoluteAppUrl("/app"),
    });
    await sendEmail({ to, ...content, tag: "approval_decision" });
  } catch (err) {
    console.error("[team] decision email failed", err instanceof Error ? err.message : "unknown");
  }
}
