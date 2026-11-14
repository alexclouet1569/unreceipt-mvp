// SERVER-ONLY. The "welcome to the pilot" email, sent once per user right
// after their first successful /auth/callback (email confirmation or first
// magic link).
//
// Exactly-once is enforced in the database: the send first claims
// profiles.welcome_email_sent_at with a conditional UPDATE (only rows where
// it is still NULL), so two callbacks racing can't both send. If Resend
// refuses the email the claim is released so the next sign-in link retries.
//
// Accountants are not customers: someone who is (or has been added as)
// firm staff and has no company of their own gets no customer welcome (the
// firm admin got the firm welcome; /firm is their place). Nothing is
// claimed then, so if they later start a company of their own, a later
// sign-in still sends it.

import { after } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";
import { buildForwardingAddress, getOrCreateAliasForUser } from "./email-alias";
import { isPilotMode } from "./pilot";
import { findPendingFirmSeat, getFirmMembership } from "./require-firm";
import { hasAnyMembership } from "./organizations";
import { sendEmail, founderReplyTo } from "./email/send";
import { firstNameFrom, pilotWelcomeEmail } from "./email/templates";

const PRODUCT_URL_FALLBACK = "https://app.unreceipt.com";

export type WelcomeOutcome = "sent" | "already_sent" | "skipped" | "failed";

type WelcomeUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
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

// Firm staff (a member, or a seat waiting for this confirmed address) with
// no company membership of their own.
async function isFirmStaffOnly(user: WelcomeUser): Promise<boolean> {
  const [membership, seat] = await Promise.all([getFirmMembership(user.id), findPendingFirmSeat(user)]);
  if (!membership && !seat) return false;
  return !(await hasAnyMembership(user.id));
}

export async function sendWelcomeEmailOnce(user: WelcomeUser): Promise<WelcomeOutcome> {
  if (!user.email) return "skipped";
  if (!process.env.RESEND_API_KEY) return "skipped";
  if (await isFirmStaffOnly(user)) return "skipped";

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
