// Month / Quarter / Year / Dates and ‹ November 2026 ›, as links: the period
// lives in the page's address, so it survives a reload and the back button
// (DESIGN.md "Charts and Insights": the By date / By category track with
// four options). Dates shows a small From / To form under it.

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AnalyticsPeriodKind } from "@/lib/mobile/types";
import { PeriodForm, PeriodLink } from "./PeriodPending";
import { addDays, periodSearch, periodTitle, shiftPeriod, type PeriodQuery, type ReadyAnalytics } from "@/lib/analytics/display";

/** Builds the page's address for a period; the demo tour keeps its own. */
export type PeriodHref = (q: PeriodQuery) => string;

export const insightsHref: PeriodHref = (q) => `/app/insights?${periodSearch(q)}`;

const KINDS: { kind: AnalyticsPeriodKind; label: string }[] = [
  { kind: "month", label: "Month" },
  { kind: "quarter", label: "Quarter" },
  { kind: "year", label: "Year" },
  { kind: "custom", label: "Dates" },
];

function ArrowLink({ to, dir }: { to: string | null; dir: "left" | "right" }) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  const label = dir === "left" ? "Previous period" : "Next period";
  const cls = "inline-flex h-11 w-11 items-center justify-center rounded-[10px]";
  if (!to) {
    return (
      <span aria-hidden="true" className={`${cls} text-[var(--ink-faint)]`}>
        <Icon className="h-5 w-5" />
      </span>
    );
  }
  return (
    <PeriodLink
      href={to}
      aria-label={label}
      className={`${cls} text-[var(--ink)] outline-none transition-colors duration-100 hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
    >
      <Icon className="h-5 w-5" />
    </PeriodLink>
  );
}

export function PeriodHeader({
  a,
  href = insightsHref,
  dates = { action: "/app/insights" },
}: {
  a: ReadyAnalytics;
  href?: PeriodHref;
  /** Where the Dates form goes, with extra fields to keep (the demo's step). */
  dates?: { action: string; keep?: Record<string, string> };
}) {
  const kind = a.period.kind;
  const prev = shiftPeriod(a, -1);
  const next = shiftPeriod(a, 1);
  // Dates starts on the 30 days up to today.
  const forKind = (k: AnalyticsPeriodKind): PeriodQuery =>
    k === "custom" ? { kind: "custom", from: addDays(a.today, -29), to: a.today } : { kind: k };

  return (
    <div>
      <nav
        aria-label="Period"
        className="grid grid-cols-4 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1"
      >
        {KINDS.map((k) => {
          const active = k.kind === kind;
          return (
            <PeriodLink
              key={k.kind}
              href={href(forKind(k.kind))}
              aria-current={active ? "page" : undefined}
              className={
                "flex h-11 items-center justify-center rounded-[6px] border text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] " +
                (active
                  ? "border-[var(--hairline)] bg-card text-[var(--ink)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]")
              }
            >
              {k.label}
            </PeriodLink>
          );
        })}
      </nav>

      {kind === "custom" ? (
        <PeriodForm action={dates.action} className="mt-3 flex flex-wrap items-end gap-2">
          {Object.entries(dates.keep ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="period" value="custom" />
          <label className="min-w-[130px] flex-1 type-micro text-[var(--ink-muted)]">
            From
            <input
              type="date"
              name="from"
              defaultValue={a.period.from}
              max={a.today}
              required
              className="mt-1 block h-11 w-full rounded-[6px] border border-[var(--hairline)] bg-card px-3 text-[16px] font-normal tracking-normal text-[var(--ink)] normal-case outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </label>
          <label className="min-w-[130px] flex-1 type-micro text-[var(--ink-muted)]">
            To
            <input
              type="date"
              name="to"
              defaultValue={a.period.to}
              max={a.today}
              required
              className="mt-1 block h-11 w-full rounded-[6px] border border-[var(--hairline)] bg-card px-3 text-[16px] font-normal tracking-normal text-[var(--ink)] normal-case outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-[10px] border border-[var(--hairline)] bg-card px-4 text-[14px] font-semibold text-[var(--ink)] outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Show
          </button>
        </PeriodForm>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <ArrowLink dir="left" to={prev ? href(prev) : null} />
        <h2 aria-live="polite" className="type-body-lg text-[var(--ink)]">
          {periodTitle(a.period)}
        </h2>
        <ArrowLink dir="right" to={next ? href(next) : null} />
      </div>
    </div>
  );
}
