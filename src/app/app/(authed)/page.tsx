import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkSubscriptionGate } from "@/lib/subscription-gate";
import { handleSelfHeal } from "@/lib/self-heal";
import {
  buildForwardingAddress,
  getOrCreateAliasForUser,
} from "@/lib/email-alias";
import { getConciergeEmail } from "@/lib/concierge-email";
import { getOrCreateDefaultOrganization, hasAnyMembership } from "@/lib/organizations";
import { getFirmMembership } from "@/lib/require-firm";
import type { Receipt } from "@/lib/types";
import { loadAccountantLinks } from "@/lib/firm/client-links";
import type { PendingAccountantInvite } from "@/components/AccountantInviteNotice";
import { Dashboard } from "./dashboard";
import { SelfHealSpinner } from "./_self-heal-spinner";
import { DbWarningBanner } from "./_db-warning-banner";
import { PilotBanner } from "./_pilot-banner";
import { UsageNoticeBanner } from "@/components/UsageNoticeBanner";
import { getUsage } from "@/lib/usage";
import { usageNotice, type UsageNotice } from "@/lib/usage-copy";

// The gate reads cookies + DB on every request — never cache.
export const dynamic = "force-dynamic";

const RECENT_RECEIPTS_LIMIT = 50;

type AppPageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

async function loadReceiptsForUser(userId: string): Promise<Receipt[]> {
  // Use the service-role client so the customer's first paint doesn't
  // wait on an extra cookie round-trip just to satisfy RLS we already
  // know is satisfied (the gate above proved this is the right user).
  // Sort matches the receipts_user_id_purchased_at_idx index:
  // purchased_at DESC with NULLs last, falling back to created_at DESC.
  // Rows created before step 3 have NULL purchased_at and slot into the
  // bottom of the list by their creation time, which is the right UX.
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .select("*")
    .eq("user_id", userId)
    .order("purchased_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(RECENT_RECEIPTS_LIMIT);

  if (error) {
    Sentry.captureException(error, { tags: { area: "/app load" } });
    console.error("[/app] receipts load failed", error);
    return [];
  }
  return (data ?? []) as Receipt[];
}

// First-run onboarding shows until finished or skipped. A failed read (or
// the column not existing yet) counts as done: never trap someone in it.
// Accounting-firm invites addressed to this user that wait for an answer.
// Best-effort: a failed lookup just hides the notice (Settings still has it).
async function loadPendingInvites(
  user: Parameters<typeof loadAccountantLinks>[0]
): Promise<PendingAccountantInvite[]> {
  try {
    const links = await loadAccountantLinks(user);
    return links
      .filter((l) => l.status === "invited")
      .map((l) => ({ id: l.id, firmName: l.firmName }));
  } catch (err) {
    console.error("[/app] accountant invites load failed", err);
    return [];
  }
}

async function loadOnboarded(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return true;
  return Boolean(data?.onboarded_at);
}

// Near/over the plan's receipt allowance? Best-effort: a failed lookup
// just hides the notice.
async function loadUsageNotice(userId: string): Promise<UsageNotice | null> {
  try {
    return usageNotice(await getUsage(userId));
  } catch (err) {
    console.error("[/app] usage load failed", err);
    return null;
  }
}

export default async function AppPage({ searchParams }: AppPageProps) {
  const user = await getServerUser();
  if (!user) {
    redirect("/app/login");
  }

  // Firm staff with no company of their own belong on the firm portal.
  // Checked before the gate and before any lazy mint below, so an accountant
  // never gets a phantom company or a subscribe prompt.
  if (await getFirmMembership(user.id)) {
    if (!(await hasAnyMembership(user.id))) redirect("/firm");
  }

  const { session_id } = await searchParams;
  const sessionId = session_id ?? null;
  const result = await checkSubscriptionGate(user.id, sessionId);

  if (result.kind === "redirect_subscribe") {
    redirect("/subscribe");
  }

  if (result.kind === "self_heal") {
    const outcome = await handleSelfHeal(user.id, result.sessionId);
    if (outcome === "success") {
      // Strip ?session_id and re-render via the gate — the new gate run
      // finds the row we just upserted and falls into the allow branch.
      redirect("/app");
    }
    if (outcome === "not_paid") {
      redirect("/subscribe");
    }
    // stripe_down — show the spinner; it bounces to /app after ~3s.
    return <SelfHealSpinner />;
  }

  const userEmail = user.email ?? "";
  const [receipts, onboarded, accountantInvites] = await Promise.all([
    loadReceiptsForUser(user.id),
    loadOnboarded(user.id),
    loadPendingInvites(user),
  ]);
  const showOnboarding = !onboarded && receipts.length === 0;

  // Mint (or fetch) the user's forwarding alias. This is the live MX
  // address that routes to the /api/intake/email webhook — surfaced on
  // the empty state so first-time users have somewhere to forward to.
  // Falls back to the legacy getConciergeEmail derivation if the profile
  // row is missing (shouldn't happen post-signup, but the gate runs
  // before profile-sync in a few edge cases).
  const [aliasHash] = await Promise.all([
    getOrCreateAliasForUser(user.id),
    // The company this account's receipts belong to (firm portal). Minted
    // here so it exists before the first receipt; failures fall back to the
    // insert trigger.
    getOrCreateDefaultOrganization(user.id),
  ]);
  const forwardingEmail = aliasHash
    ? buildForwardingAddress(aliasHash)
    : getConciergeEmail(user.id);

  // Shared concierge SMS/WhatsApp line (step 7). When unset, the empty
  // state degrades to email-only — production should set this once the
  // Twilio number is provisioned.
  const intakeSmsNumber = process.env.NEXT_PUBLIC_INTAKE_SMS_NUMBER ?? null;

  if (result.kind === "allow_with_warning") {
    const Banner =
      result.reason === "pilot_mode" ? PilotBanner : DbWarningBanner;
    return (
      <>
        <Banner />
        <Dashboard
          userEmail={userEmail}
          receipts={receipts}
          forwardingEmail={forwardingEmail}
          intakeSmsNumber={intakeSmsNumber}
          showOnboarding={showOnboarding}
          accountantInvites={accountantInvites}
        />
      </>
    );
  }

  const notice = await loadUsageNotice(user.id);

  return (
    <>
      {notice ? <UsageNoticeBanner notice={notice} /> : null}
      <Dashboard
        userEmail={userEmail}
        receipts={receipts}
        forwardingEmail={forwardingEmail}
        intakeSmsNumber={intakeSmsNumber}
        showOnboarding={showOnboarding}
          accountantInvites={accountantInvites}
      />
    </>
  );
}
