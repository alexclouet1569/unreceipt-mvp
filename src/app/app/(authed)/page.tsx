import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { checkSubscriptionGate } from "@/lib/subscription-gate";
import { handleSelfHeal } from "@/lib/self-heal";
import { Dashboard } from "./dashboard";
import { SelfHealSpinner } from "./_self-heal-spinner";
import { DbWarningBanner } from "./_db-warning-banner";

// The gate reads cookies + DB on every request — never cache.
export const dynamic = "force-dynamic";

type AppPageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function AppPage({ searchParams }: AppPageProps) {
  const user = await getServerUser();
  if (!user) {
    redirect("/app/login");
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

  if (result.kind === "allow_with_warning") {
    return (
      <>
        <DbWarningBanner />
        <Dashboard userEmail={userEmail} />
      </>
    );
  }

  return <Dashboard userEmail={userEmail} />;
}
