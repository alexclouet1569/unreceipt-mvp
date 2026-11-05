// SERVER-ONLY. The confirmation a client company gets whenever an
// accounting firm starts seeing its receipts, whichever side sent the
// invite. A security notice as much as a receipt: if the client didn't
// agree, the email points to Settings → Stop sharing. Best effort: a
// failure is logged, never thrown.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail, founderReplyTo } from "@/lib/email/send";
import { linkConfirmationEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/app-url";

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
      settingsUrl: appUrl("/app/settings"),
    });
    const sent = await sendEmail({ to, ...content, replyTo: founderReplyTo(), tag: "link_confirmation" });
    if (!sent.ok) console.error("[link-emails] confirmation not sent", sent.reason);
  } catch (err) {
    console.error("[link-emails] confirmation failed", err);
  }
}
