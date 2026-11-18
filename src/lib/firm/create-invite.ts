// SERVER-ONLY. One firm → client invite: a firm_clients row (status
// invited, hashed link token, 14 days) and the email with the link. Shared
// by "Add client" (POST /api/firm/clients) and "Invite several" (POST
// /api/firm/clients/bulk); callers check the firm member and the rate limit
// first. The firm comes from the session (requireFirmMember), never a body.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail, founderReplyTo } from "@/lib/email/send";
import { firmInviteEmail } from "@/lib/email/templates";
import { emailSiteLocale } from "@/lib/email/site-link";
import { absoluteAppUrl, iosAppUrl } from "@/lib/app-url";
import { inviteAcceptPath, inviteExpiry, mintInviteToken } from "./invites";

export type InviteInput = {
  firmId: string;
  firmName: string;
  /** The firm's country (FirmContext.firmCountry): which site the footer links to. */
  firmCountry?: string | null;
  invitedBy: string;
  clientName: string;
  clientOrgNumber: string | null;
  /** Already normalised (normalizeAddress). */
  email: string;
};

export type InviteOutcome = { ok: true; id: string; emailed: boolean } | { ok: false };

export async function createFirmInvite(input: InviteInput): Promise<InviteOutcome> {
  const { token, hash } = mintInviteToken();
  const { data: inserted, error } = await getSupabaseAdmin()
    .from("firm_clients")
    .insert({
      firm_id: input.firmId,
      status: "invited",
      client_name: input.clientName,
      client_org_number: input.clientOrgNumber,
      invited_email: input.email,
      invite_token_hash: hash,
      invite_expires_at: inviteExpiry(),
      invited_by: input.invitedBy,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[firm invite] insert failed", error?.code);
    return { ok: false };
  }
  const content = firmInviteEmail({
    firmName: input.firmName,
    clientName: input.clientName,
    url: absoluteAppUrl(inviteAcceptPath(token)),
    appUrl: iosAppUrl(),
    site: emailSiteLocale({ country: input.firmCountry ?? null, email: input.email }),
  });
  const sent = await sendEmail({ to: input.email, ...content, replyTo: founderReplyTo(), tag: "firm_invite" });
  // The invite stays when the email fails: the client can still accept from
  // Settings by email match.
  if (!sent.ok) console.error("[firm invite] email failed", sent.reason);
  return { ok: true, id: inserted.id as string, emailed: sent.ok };
}
