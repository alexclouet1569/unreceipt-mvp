// SERVER-ONLY. The "welcome to the pilot" email, sent once per user right
// after their first successful /auth/callback (email confirmation or first
// magic link).
//
// Exactly-once is enforced in the database: the send first claims
// profiles.welcome_email_sent_at with a conditional UPDATE (only rows where
// it is still NULL), so two callbacks racing can't both send. If Resend
// refuses the email the claim is released so the next sign-in link retries.

import { after } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";
import { buildForwardingAddress, getOrCreateAliasForUser } from "./email-alias";
import { isPilotMode } from "./pilot";
import { sendEmail, founderReplyTo } from "./email/send";
import { firstNameFrom, pilotWelcomeEmail } from "./email/templates";

const PRODUCT_URL_FALLBACK = "https://app.unreceipt.com";

export type WelcomeOutcome = "sent" | "already_sent" | "skipped" | "failed";

type WelcomeUser = {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: unknown } | null;
};

// Runs after the redirect has been sent, so sign-in isn't slowed down.
export function scheduleWelcomeEmail(user: WelcomeUser): void {
  after(async () => {
    try {
      await sendWelcomeEmailOnce(user);
    } catch (err) {
      console.error("[welcome-email] unexpected failure", err);
    }
  });
}

// Forwarding is only promised once the inbound webhook is actually wired.
function inboundEmailLive(): boolean {
  return Boolean(process.env.RESEND_INBOUND_WEBHOOK_SECRET);
}

function productUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  return `${base && base.startsWith("http") ? base : PRODUCT_URL_FALLBACK}/app`;
}

export async function sendWelcomeEmailOnce(user: WelcomeUser): Promise<WelcomeOutcome> {
  if (!user.email) return "skipped";
  if (!process.env.RESEND_API_KEY) return "skipped";

  const admin = getSupabaseAdmin();

  const { data: claimed, error: claimError } = await admin
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("welcome_email_sent_at", null)
    .select("user_id");

  if (claimError) {
    console.error("[welcome-email] claim failed", claimError);
    return "failed";
  }
  if (!claimed || claimed.length === 0) return "already_sent";

  const forwardingAddress = inboundEmailLive()
    ? await getOrCreateAliasForUser(user.id).then((hash) =>
        hash ? buildForwardingAddress(hash) : null
      )
    : null;

  const replyTo = founderReplyTo();
  const fullName = user.user_metadata?.full_name;
  const content = pilotWelcomeEmail({
    firstName: firstNameFrom(typeof fullName === "string" ? fullName : null),
    appUrl: productUrl(),
    forwardingAddress,
    pilotMode: isPilotMode(),
    canReply: replyTo !== null,
  });

  const result = await sendEmail({
    to: user.email,
    ...content,
    replyTo,
    tag: "pilot_welcome",
  });

  if (!result.ok) {
    await admin
      .from("profiles")
      .update({ welcome_email_sent_at: null })
      .eq("user_id", user.id);
    return "failed";
  }
  return "sent";
}
