import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkSubscriptionGate } from "@/lib/subscription-gate";
import { handleSelfHeal } from "@/lib/self-heal";
import type { Receipt } from "@/lib/types";
import { Dashboard } from "./dashboard";
import { SelfHealSpinner } from "./_self-heal-spinner";
import { DbWarningBanner } from "./_db-warning-banner";

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
  const { data, error } = await getSupabaseAdmin()
    .from("receipts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_RECEIPTS_LIMIT);

  if (error) {
    // TODO(step-11): Sentry.captureException(error, { tags: { area: "/app load" } });
    console.error("[/app] receipts load failed", error);
    return [];
  }
  return (data ?? []) as Receipt[];
}

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
  const receipts = await loadReceiptsForUser(user.id);

  if (result.kind === "allow_with_warning") {
    return (
      <>
        <DbWarningBanner />
        <Dashboard userId={user.id} userEmail={userEmail} receipts={receipts} />
      </>
    );
  }

  return (
    <Dashboard userId={user.id} userEmail={userEmail} receipts={receipts} />
  );
}
