// SERVER-ONLY. "Send a reminder now" for one client (firm portal on the web
// and the iPhone app's Clients tab): the same email as the Monday reminder
// (src/lib/reminders/weekly.ts: bank payments without a receipt, receipts
// that miss merchant, amount or date, how many wait only for a
// confirmation), sent at once by the accountant. The same rules: only what
// the firm may see (collectClientNeeds uses firmVisible), confirmed owner
// addresses only (the email carries bank text), the firm's first signed-in
// admin as Reply-To, nothing sent when there is nothing to ask, and the
// client's own "no reminders" choice in Settings is respected. Logged in
// client_reminders as kind 'manual' (counts only). The caller checks the
// firm member, the client access and the rate limit first.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dayLabel, receiptDay } from "@/lib/bank/month";
import { formatAmount } from "@/lib/receipt-format";
import { sendEmail } from "@/lib/email/send";
import { weeklyReminderEmail } from "@/lib/email/templates";
import { absoluteAppUrl } from "@/lib/app-url";
import { collectClientNeeds } from "./weekly";

export type ReminderNowResult =
  | { ok: true; recipients: number }
  | { ok: false; reason: "opted_out" | "nothing_to_ask" | "no_recipient" | "failed" };

export async function sendReminderNow(opts: {
  firmId: string;
  firmName: string;
  firmClientId: string;
  organizationId: string;
  clientName: string;
  now?: Date;
}): Promise<ReminderNowResult> {
  const db = getSupabaseAdmin();
  const now = opts.now ?? new Date();

  const { data: link, error: linkError } = await db
    .from("firm_clients")
    .select("reminders_opted_out_at")
    .eq("id", opts.firmClientId)
    .maybeSingle();
  if (linkError) throw new Error(`link unreadable (${linkError.code})`);
  if (link?.reminders_opted_out_at) return { ok: false, reason: "opted_out" };

  const needs = await collectClientNeeds(opts.organizationId, now);
  if (needs.payments.length === 0 && needs.receipts.length === 0 && needs.toConfirm === 0) {
    return { ok: false, reason: "nothing_to_ask" };
  }

  const [{ data: owners, error: ownersError }, { data: admin }] = await Promise.all([
    db.from("memberships").select("user_id").eq("organization_id", opts.organizationId).eq("role", "owner"),
    db
      .from("firm_members")
      .select("email")
      .eq("firm_id", opts.firmId)
      .eq("role", "admin")
      .not("user_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (ownersError) throw new Error(`owners unreadable (${ownersError.code})`);

  const content = weeklyReminderEmail({
    firmName: opts.firmName,
    clientName: opts.clientName,
    payments: needs.payments.map((l) => ({
      day: dayLabel(l.bookedOn),
      description: l.description,
      amount: formatAmount(-l.amount, l.currency),
    })),
    receipts: needs.receipts.map((r) => {
      const d = receiptDay(r);
      return {
        day: d ? dayLabel(d) : dayLabel(r.created_at.slice(0, 10)),
        merchant: r.merchant_name?.trim() || "Receipt",
        missing: r.missing,
      };
    }),
    toConfirm: needs.toConfirm,
    appUrl: absoluteAppUrl("/app"),
    settingsUrl: absoluteAppUrl("/app/settings"),
  });
  const replyTo = typeof admin?.email === "string" ? admin.email : null;

  let recipients = 0;
  for (const userId of [...new Set((owners ?? []).map((o) => o.user_id as string))]) {
    const { data: userRes } = await db.auth.admin.getUserById(userId);
    // Confirmed addresses only: the email carries bank text.
    const to = userRes?.user?.email_confirmed_at ? userRes.user.email : null;
    if (!to) continue;
    const sent = await sendEmail({ to, ...content, replyTo, tag: "manual_reminder" });
    if (sent.ok) recipients++;
    else console.error("[reminder now] not sent", sent.reason);
  }
  if (recipients === 0) return { ok: false, reason: "no_recipient" };

  const { error: logError } = await db.from("client_reminders").insert({
    organization_id: opts.organizationId,
    firm_id: opts.firmId,
    kind: "manual",
    missing_count: needs.payments.length,
    review_count: needs.receipts.length + needs.toConfirm,
    recipients,
  });
  if (logError) console.error("[reminder now] log failed", logError.code);
  const ids = needs.payments.map((l) => l.id);
  const stamp = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 100) {
    await db
      .from("bank_transactions")
      .update({ reminded_at: stamp })
      .eq("organization_id", opts.organizationId)
      .in("id", ids.slice(i, i + 100));
  }
  return { ok: true, recipients };
}
