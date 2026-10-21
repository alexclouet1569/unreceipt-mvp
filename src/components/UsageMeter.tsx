"use client";

import { OVERAGE_PRICE, type Plan } from "@/lib/plans";
import { useI18n } from "@/lib/i18n/client";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/locale";
import type { PlanSuggestion } from "@/lib/usage-copy";
import { Money } from "@/components/Money";

type Props = {
  used: number;
  plan: Plan | null;
  extra: number;
  overageBilled: boolean;
  periodEnd: string;
  suggestion: PlanSuggestion | null;
};

// "3 November" in English too: day-first reads well next to the counter.
function resetDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

/** Text after a mono amount: a space, unless it starts with punctuation. */
function after(text: string): string {
  return /^[.,;:]/.test(text) ? text : ` ${text}`;
}

/** Receipts used this billing period against the plan's allowance. */
export function UsageMeter({ used, plan, extra, overageBilled, periodEnd, suggestion }: Props) {
  const { locale, t: messages } = useI18n();
  const t = messages.settings.usage;
  const resets = resetDate(periodEnd, locale);

  if (!plan) {
    return (
      <div
        className="bg-card"
        style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
      >
        <p className="text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
          {t.thisMonth(used)}
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", marginTop: "2px" }}>
          {t.pilot(resets)}
        </p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((used / plan.receipts) * 100));
  const over = extra > 0;

  return (
    <div
      className="bg-card"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
          {t.usedOf(used, plan.receipts)}
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", fontWeight: 500 }}>
          {t.plan(plan.name)}
        </p>
      </div>
      <div
        className="mt-2 overflow-hidden"
        style={{ height: "6px", borderRadius: "9999px", background: "var(--hairline)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={plan.receipts}
        aria-valuenow={Math.min(used, plan.receipts)}
        aria-label={t.progressLabel}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over ? "var(--attention)" : "var(--primary)",
          }}
        />
      </div>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", marginTop: "8px" }}>
        {over ? (
          overageBilled ? (
            <>
              {t.extraTimes(extra)} <Money eur={OVERAGE_PRICE} /> ={" "}
              <Money eur={extra * OVERAGE_PRICE} />
              {after(t.onNextInvoice)}
            </>
          ) : (
            t.over(extra)
          )
        ) : (
          <>
            {t.resets(resets)} {t.extraEachBefore} <Money eur={OVERAGE_PRICE} />
            {after(t.extraEachAfter)}
          </>
        )}
      </p>
      {suggestion ? (
        <p className="text-[var(--ink)]" style={{ fontSize: "13px", marginTop: "8px", fontWeight: 500 }}>
          {t.suggestBefore(suggestion.used, suggestion.planName)}{" "}
          <Money eur={suggestion.better} /> {t.insteadOf} <Money eur={suggestion.current} />
          {after(t.suggestAfter)}
        </p>
      ) : null}
    </div>
  );
}
