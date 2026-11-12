import Link from "next/link";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { ArrowLeft } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import {
  AnalyticsInputError,
  drillFilterFromParams,
  loadDrillRows,
  periodFromParams,
  todayInStockholm,
  type DrillFilter,
} from "@/lib/analytics/load";
import { categoryLabel, periodSearch, periodTitle, type PeriodQuery } from "@/lib/analytics/display";
import { rateLimit } from "@/lib/rate-limit";
import type { ReceiptCategory } from "@/lib/types";
import { DrillList } from "./DrillList";

// The receipts behind a number on the Insights page (a category, a
// merchant, a finding, the VAT to check), newest first, at most 200. Each
// opens the same receipt sheet as /app.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const QUALITY_TITLE: Record<string, string> = {
  to_complete: "To complete",
  unconverted: "Not converted yet",
  missing_amount: "Without an amount",
  to_confirm: "To confirm",
  vat_to_check: "VAT to check",
};

function titleFor(f: DrillFilter, names: string[]): string {
  switch (f.kind) {
    case "all":
      return "Receipts";
    case "category":
      return categoryLabel(f.category as ReceiptCategory);
    case "merchant":
      return names[0] ?? "Receipts";
    case "ids":
      return "Receipts";
    case "quality":
      return QUALITY_TITLE[f.which] ?? "Receipts";
  }
}

export default async function InsightsReceiptsPage({ searchParams }: Props) {
  const user = await getServerUser();
  if (!user) redirect("/app/login");

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);

  const today = todayInStockholm();
  let period;
  let filter: DrillFilter;
  try {
    period = periodFromParams(params, today);
    filter = drillFilterFromParams(params);
  } catch (err) {
    if (err instanceof AnalyticsInputError) redirect("/app/insights");
    throw err;
  }

  const back: PeriodQuery =
    period.kind === "custom" ? { kind: "custom", from: period.from, to: period.to } : { kind: period.kind, anchor: period.key };
  const backHref = `/app/insights?${periodSearch(back)}`;

  const limited = await rateLimit("analytics", user.id);
  let result: Awaited<ReturnType<typeof loadDrillRows>> | null = null;
  if (limited.ok) {
    try {
      result = await loadDrillRows(user, period, filter);
    } catch (err) {
      console.error("[/app/insights/receipts] load failed", err);
      Sentry.captureException(err, { tags: { area: "analytics" } });
      throw err;
    }
  }
  if (result && "state" in result) redirect(result.state === "firm_only" ? "/firm" : "/subscribe");

  return (
    <div className="mx-auto max-w-[540px] px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+var(--tabbar-h)+48px)]">
      <Link
        href={backHref}
        className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[10px] px-2 text-[14px] font-semibold text-[var(--ink-muted)] outline-none transition-colors duration-100 hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Insights
      </Link>
      <h1 className="mt-1 type-display-lg text-[var(--ink)]">
        {titleFor(filter, result && !("state" in result) ? result.rows.map((r) => r.merchant_name ?? "").filter(Boolean) : [])}
      </h1>
      <p className="mt-0.5 mb-6 type-caption text-[var(--ink-muted)]">{periodTitle(period)}</p>
      {!result ? (
        <p role="alert" className="rounded-[10px] bg-[var(--attention-tint)] px-3 py-2 text-[14px] font-semibold text-[var(--attention-deep)]">
          Too many requests in a short time. Try again in a minute.
        </p>
      ) : "state" in result ? null : result.rows.length === 0 ? (
        <p className="py-8 text-center type-caption font-normal text-[var(--ink-muted)]">No receipts here.</p>
      ) : (
        <>
          <DrillList receipts={result.rows} />
          {result.truncated ? (
            <p className="mt-4 text-center type-caption text-[var(--ink-muted)]">Showing the latest 200.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
