import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getServerUser } from "@/lib/supabase-server";
import { AnalyticsInputError, loadAnalytics, periodFromParams, todayInStockholm } from "@/lib/analytics/load";
import { periodSearch, shownPeriod } from "@/lib/analytics/display";
import { rateLimit } from "@/lib/rate-limit";
import { InsightsBody, type DrillHref } from "./InsightsView";
import { PeriodHeader } from "./PeriodHeader";
import { PendingBody, PeriodScope } from "./PeriodPending";

// Spending by period (DESIGN.md "Charts and Insights"): the same engine as
// the iPhone app's Insights tab (src/lib/analytics, AGENTS.md "Insights"),
// read on the server. The period is in the address (?period=&anchor= or
// &from=&to=); without one, the month that holds today.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InsightsPage({ searchParams }: Props) {
  const user = await getServerUser();
  if (!user) redirect("/app/login");

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["period", "anchor", "from", "to"]) {
    const v = raw[key];
    if (typeof v === "string") params.set(key, v);
  }
  if (!params.has("period")) params.set("period", "month");

  const today = todayInStockholm();
  let period;
  try {
    period = periodFromParams(params, today);
  } catch (err) {
    // A typed or stale address: back to this month rather than an error.
    if (err instanceof AnalyticsInputError) redirect("/app/insights");
    throw err;
  }

  // Every load reads all of the user's receipts: the same per-user limit as
  // the iPhone app's /api/mobile/analytics.
  const limited = await rateLimit("analytics", user.id);
  if (!limited.ok) {
    return (
      <div className="mx-auto max-w-[540px] px-4 py-6">
        <h1 className="mb-4 type-display-lg text-[var(--ink)]">Insights</h1>
        <p role="alert" className="rounded-[10px] bg-[var(--attention-tint)] px-3 py-2 text-[14px] font-semibold text-[var(--attention-deep)]">
          Too many requests in a short time. Try again in a minute.
        </p>
      </div>
    );
  }

  let analytics;
  try {
    analytics = await loadAnalytics(user, period, today);
  } catch (err) {
    // A failed read (the company's currency included) is an error, never a
    // guess: error.tsx offers to try again.
    console.error("[/app/insights] load failed", err);
    Sentry.captureException(err, { tags: { area: "analytics" } });
    throw err;
  }
  if (analytics.state === "firm_only") redirect("/firm");
  if (analytics.state === "inactive") redirect("/subscribe");

  const a = analytics;
  const base = periodSearch(shownPeriod(a));
  const href: DrillHref = (filter) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(filter)) p.set(k, v);
    return `/app/insights/receipts?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[540px] px-4 py-6 pb-[calc(env(safe-area-inset-bottom,0px)+var(--tabbar-h)+48px)]">
      <h1 className="mb-4 type-display-lg text-[var(--ink)]">Insights</h1>
      <PeriodScope>
        <PeriodHeader a={a} />
        <div className="mt-6">
          <PendingBody>
            <InsightsBody a={a} href={href} />
          </PendingBody>
        </div>
      </PeriodScope>
    </div>
  );
}
