import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { handleSelfHeal } from "@/lib/self-heal";
import { loadHome } from "@/lib/home/load-home";
import { getNativeApp } from "@/lib/native-app-server";
import { FirmUnavailable } from "./_firm-unavailable";
import { Dashboard } from "./dashboard";
import { SelfHealSpinner } from "./_self-heal-spinner";
import { DbWarningBanner } from "./_db-warning-banner";
import { PilotBanner } from "./_pilot-banner";
import { UsageNoticeBanner } from "@/components/UsageNoticeBanner";
import { getUsage } from "@/lib/usage";
import { usageNotice, type UsageNotice } from "@/lib/usage-copy";
import { loadConnectedEmails, loadMailboxProviders } from "./settings/mailboxes/load";
import { NO_PROVIDERS, anyProvider } from "./settings/mailboxes/copy";

// The gate reads cookies + DB on every request — never cache.
export const dynamic = "force-dynamic";

type AppPageProps = {
  searchParams: Promise<{ session_id?: string; firm?: string }>;
};

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

  const { session_id, firm } = await searchParams;
  // Reads, firm-only and subscription checks, then the alias and company:
  // shared with the iPhone app's GET /api/mobile/home (src/lib/home).
  const home = await loadHome(user, session_id ?? null, { askAboutFirmSeat: true });

  // Firm staff with no company of their own (or a firm seat waiting for this
  // address) belong on the firm portal, which claims the seat.
  // `?firm=unavailable` is /firm sending a firm-only user back because it
  // couldn't read their membership (a database error): show a notice instead of
  // redirecting again, which would loop between the two pages.
  // A firm added this address as staff and there's no company yet: ask.
  if (home.kind === "firm_pending") redirect("/app/firm-join");
  if (home.kind === "firm_only") {
    if (firm === "unavailable") return <FirmUnavailable />;
    redirect("/firm");
  }
  if (home.kind === "subscribe") redirect("/subscribe");

  if (home.kind === "self_heal") {
    const outcome = await handleSelfHeal(user.id, home.sessionId);
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

  const { receipts, forwardingEmail, showOnboarding, accountantInvites, homeCurrency, older } =
    home.data;

  // Shared concierge SMS/WhatsApp line (step 7). When unset, the empty
  // state degrades to email-only — production should set this once the
  // Twilio number is provisioned.
  const intakeSmsNumber = process.env.NEXT_PUBLIC_INTAKE_SMS_NUMBER ?? null;

  const inStoreApp = Boolean(await getNativeApp());

  // "Connect your email" (Gmail / Outlook) leads the first-run step and the
  // empty inbox when a provider is set up. Not in the Capacitor shell: the
  // provider's screen opens in Safari there, away from the cookie that
  // binds the flow, so it couldn't finish. The list is read only for those
  // two screens.
  const mailboxProviders = inStoreApp ? NO_PROVIDERS : loadMailboxProviders();
  const connectedMailboxes =
    anyProvider(mailboxProviders) && (showOnboarding || receipts.length === 0)
      ? await loadConnectedEmails(user.id)
      : [];

  const dashboard = (
    <Dashboard
      userEmail={user.email ?? ""}
      receipts={receipts}
      forwardingEmail={forwardingEmail}
      intakeSmsNumber={intakeSmsNumber}
      showOnboarding={showOnboarding}
      accountantInvites={accountantInvites}
      homeCurrency={homeCurrency}
      older={older}
      mailboxProviders={mailboxProviders}
      connectedMailboxes={connectedMailboxes}
    />
  );

  if (home.access !== "active") {
    return (
      <>
        {home.access === "pilot" ? <PilotBanner inStoreApp={inStoreApp} /> : <DbWarningBanner />}
        {dashboard}
      </>
    );
  }

  const notice = await loadUsageNotice(user.id);

  return (
    <>
      {notice ? <UsageNoticeBanner notice={notice} hidePrices={inStoreApp} /> : null}
      {dashboard}
    </>
  );
}
