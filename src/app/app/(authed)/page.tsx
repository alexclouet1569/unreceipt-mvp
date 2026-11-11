import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { handleSelfHeal } from "@/lib/self-heal";
import { loadHome } from "@/lib/home/load-home";
import { getNativeApp } from "@/lib/native-app-server";
import { Dashboard } from "./dashboard";
import { SelfHealSpinner } from "./_self-heal-spinner";
import { DbWarningBanner } from "./_db-warning-banner";
import { PilotBanner } from "./_pilot-banner";
import { UsageNoticeBanner } from "@/components/UsageNoticeBanner";
import { getUsage } from "@/lib/usage";
import { usageNotice, type UsageNotice } from "@/lib/usage-copy";

// The gate reads cookies + DB on every request — never cache.
export const dynamic = "force-dynamic";

type AppPageProps = {
  searchParams: Promise<{ session_id?: string }>;
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

  const { session_id } = await searchParams;
  // Reads, firm-only and subscription checks, then the alias and company:
  // shared with the iPhone app's GET /api/mobile/home (src/lib/home).
  const home = await loadHome(user, session_id ?? null);

  // Firm staff with no company of their own belong on the firm portal.
  if (home.kind === "firm_only") redirect("/firm");
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
