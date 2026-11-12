// The website's Insights page body (DESIGN.md "Charts and Insights"): the
// hero, the chart, Worth knowing, Where it goes, Top merchants, the VAT on
// the receipts and what isn't in the numbers. No hooks and no server code,
// so the page (a server component) and the demo tour (in the browser) both
// render it. Hairline cards, no shadows; mint only for the VAT panel;
// amounts in Geist Mono, also inside sentences.

import Link from "next/link";
import { ChevronRight, Copy, Repeat, Sparkles, TrendingUp, Trophy, Utensils } from "lucide-react";
import type { AnalyticsInsight } from "@/lib/mobile/types";
import {
  categoryColor,
  categoryLabel,
  changeText,
  fillParts,
  insightFilter,
  insightText,
  money,
  percentText,
  plural,
  previousLabel,
  shareText,
  type Part,
  type ReadyAnalytics,
} from "@/lib/analytics/display";
import { getMerchantColor, getMerchantInitials } from "@/lib/merchant-display";
import { BarChart } from "@/components/charts/Charts";

/** Where a number leads: the receipts behind it, or null (the demo tour). */
export type DrillHref = (filter: Record<string, string>) => string | null;

/** Words in Manrope, amounts in Geist Mono, as one sentence. */
export function Parts({ parts, amountClass = "text-[var(--ink)]" }: { parts: Part[]; amountClass?: string }) {
  return (
    <>
      {parts.map((p, i) =>
        p.money ? (
          <span key={i} className={`font-mono text-[13px] tabular-nums ${amountClass}`}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-2 type-micro text-[var(--ink-muted)]">
      {children}
    </h2>
  );
}

/** A link when there is somewhere to go, a plain block otherwise. */
function Maybe({
  href,
  className,
  label,
  children,
}: {
  href: string | null;
  className: string;
  label?: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${className} outline-none transition-colors duration-100 hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]`}
    >
      {children}
    </Link>
  );
}

function Chevron({ show }: { show: boolean }) {
  return show ? <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" /> : null;
}

const CARD = "overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-card";
const ROW = "flex min-h-[56px] items-center gap-3 px-3.5 py-3";

function Hero({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  const vsPrevious = changeText(a.total.amount, a.compare.previous);
  const vsLastYear = a.period.kind !== "year" ? changeText(a.total.amount, a.compare.lastYear) : null;
  const unconverted = a.total.unconverted.map((l) => money(l.amount, l.currency)).join(" + ");
  const total = money(a.total.amount, a.currency);
  const to = a.total.count > 0 ? href({}) : null;
  return (
    <section aria-label="Spent in this period">
      <p className="type-micro text-[var(--ink-muted)]">Spent</p>
      <Maybe
        href={to}
        label={`Spent: ${a.total.estimate ? "about " : ""}${total}. Show the receipts.`}
        className="-mx-2 mt-1 inline-flex min-h-11 items-baseline gap-1 rounded-[10px] px-2 py-1"
      >
        {a.total.estimate ? (
          <span aria-hidden="true" className="font-mono text-[26px] text-[var(--ink-muted)]">
            ≈
          </span>
        ) : null}
        <span
          className={
            "font-mono font-medium tracking-[-0.02em] text-[var(--ink)] tabular-nums " +
            (total.length > 14 ? "text-[30px] leading-[1.1]" : "text-[40px] leading-[1.05]")
          }
        >
          {total}
        </span>
      </Maybe>
      {vsPrevious || vsLastYear ? (
        // Change is neutral ink: spending more isn't red, spending less isn't green.
        <div className="mt-2 flex flex-wrap gap-2">
          {vsPrevious ? <Chip text={`${vsPrevious} vs ${previousLabel(a)}`} /> : null}
          {vsLastYear ? <Chip text={`${vsLastYear} vs last year`} /> : null}
        </div>
      ) : null}
      <p className="mt-2 type-caption text-[var(--ink-muted)]">
        {plural(a.total.count, "1 receipt", "{count} receipts")}
        {a.total.toConfirm > 0
          ? ` · ${plural(a.total.toConfirm, "Includes 1 receipt to confirm", "Includes {count} receipts to confirm")}`
          : ""}
      </p>
      {unconverted ? (
        <p className="type-caption text-[var(--ink-muted)]">
          <Parts parts={fillParts("+ {amounts} not converted yet", {}, { amounts: unconverted })} amountClass="text-[var(--ink-muted)]" />
        </p>
      ) : null}
    </section>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--hairline)] bg-card px-3 type-caption text-[var(--ink)]">
      {text}
    </span>
  );
}

const FINDING_ICON: Record<AnalyticsInsight["kind"], typeof Sparkles> = {
  duplicates: Copy,
  category_up: TrendingUp,
  recurring: Repeat,
  new_merchant: Sparkles,
  largest: Trophy,
  representation: Utensils,
};

function Findings({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  if (a.insights.length === 0) return null;
  return (
    <section aria-labelledby="findings-title">
      <SectionTitle id="findings-title">Worth knowing</SectionTitle>
      <ul className="space-y-2">
        {a.insights.map((i, n) => {
          const t = insightText(i, a.currency);
          // Possible duplicates ask for something: honey, like every "needs you".
          const attention = i.kind === "duplicates";
          const filter = insightFilter(i);
          const to = filter ? href(filter) : null;
          const Icon = FINDING_ICON[i.kind];
          return (
            <li key={`${i.kind}-${n}`}>
              <Maybe
                href={to}
                className={
                  `${CARD} ${ROW} items-start ` + (attention ? "border-l-[3px] border-l-[var(--attention)]" : "")
                }
              >
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface)]">
                  <Icon className={`h-4 w-4 ${attention ? "text-[var(--attention-deep)]" : "text-[var(--ink)]"}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[15px] leading-[1.2] font-bold tracking-[-0.01em] ${attention ? "text-[var(--attention-deep)]" : "text-[var(--ink)]"}`}
                  >
                    {t.title}
                  </span>
                  <span className="mt-1 block type-caption text-[var(--ink-muted)]">
                    <Parts parts={t.body} />
                  </span>
                </span>
                <span className="self-center">
                  <Chevron show={to != null} />
                </span>
              </Maybe>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function rowDetail(count: number, share: number | null, current: number, previous: number | null): string {
  const bits = [plural(count, "1 receipt", "{count} receipts")];
  if (share != null) bits.push(shareText(share));
  const change = changeText(current, previous);
  if (change) bits.push(change);
  return bits.join(" · ");
}

function Categories({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  const shown = a.categories.filter((c) => c.count > 0);
  if (shown.length === 0) return null;
  const withAmount = shown.filter((c) => c.amount > 0);
  return (
    <section aria-labelledby="where-title">
      <SectionTitle id="where-title">Where it goes</SectionTitle>
      {withAmount.length > 0 ? (
        <div aria-hidden="true" className="mb-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {withAmount.map((c) => (
            <span key={c.category} style={{ flex: Math.max(c.share, 0.01), background: categoryColor(c.category) }} />
          ))}
        </div>
      ) : null}
      <ul className={`${CARD} divide-y divide-[var(--hairline)]`}>
        {shown.map((c) => {
          const label = categoryLabel(c.category);
          const to = href({ category: c.category });
          return (
            <li key={c.category}>
              <Maybe href={to} className={ROW}>
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: categoryColor(c.category) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-[var(--ink)]">{label}</span>
                  <span className="block type-caption text-[var(--ink-muted)]">
                    {rowDetail(c.count, c.share, c.amount, c.previous)}
                  </span>
                </span>
                <span className="type-amount-row text-[var(--ink)]">{money(c.amount, a.currency)}</span>
                <Chevron show={to != null} />
              </Maybe>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Merchants({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  if (a.merchants.length === 0) return null;
  return (
    <section aria-labelledby="merchants-title">
      <SectionTitle id="merchants-title">Top merchants</SectionTitle>
      <ul className={`${CARD} divide-y divide-[var(--hairline)]`}>
        {a.merchants.map((m) => {
          const to = href({ merchant: m.key });
          return (
            <li key={m.key}>
              <Maybe href={to} className={ROW}>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold text-white"
                  style={{ background: getMerchantColor(m.name) }}
                >
                  {getMerchantInitials(m.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-[var(--ink)]">{m.name}</span>
                  <span className="block type-caption text-[var(--ink-muted)]">
                    {rowDetail(m.count, null, m.amount, m.previous)}
                  </span>
                </span>
                <span className="type-amount-row text-[var(--ink)]">{money(m.amount, a.currency)}</span>
                <Chevron show={to != null} />
              </Maybe>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Leader({ label, amount, currency, strong = false }: { label: string; amount: number; currency: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? "text-[15px] font-bold text-[var(--ink)]" : "type-caption text-[var(--ink-muted)]"}>{label}</span>
      <span className="type-amount-row text-[var(--ink)]">{money(amount, currency)}</span>
    </div>
  );
}

const rateText = (rate: number | null) => (rate == null ? "Rate not read" : `VAT ${percentText(rate)}`);

/**
 * The VAT the receipts carry: never a VAT return, never "deductible"
 * (src/lib/analytics/vat.ts). The one mint surface on the page.
 */
function VatPanel({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  const v = a.vat;
  if (v.total === 0 && v.withoutVat === 0 && v.foreign === 0) return null;
  const toCheck = v.toCheck && v.toCheck.count > 0 ? v.toCheck : null;
  const toCheckHref = toCheck ? href({ quality: "vat_to_check" }) : null;
  return (
    <section aria-labelledby="vat-title">
      <SectionTitle id="vat-title">VAT on these receipts</SectionTitle>
      <div className="space-y-2 rounded-[12px] bg-[var(--brand-tint)] px-3.5 py-3.5">
        <Leader label="VAT on the receipts" amount={v.total} currency={a.currency} strong />
        {v.rates.map((r) => (
          <div key={String(r.rate)}>
            <Leader label={rateText(r.rate)} amount={r.vat} currency={a.currency} />
            {r.net != null ? (
              <p className="text-right text-[12px] text-[var(--ink-muted)]">
                <Parts parts={fillParts("on {amount}", {}, { amount: money(r.net, a.currency) })} amountClass="text-[12px] text-[var(--ink-muted)]" />
              </p>
            ) : null}
          </div>
        ))}
        {v.mode === "se" ? (
          <div className="space-y-2 border-t border-[var(--attention-mint)] pt-2">
            {v.swedish != null ? <Leader label="At Swedish rates, confirmed" amount={v.swedish} currency={a.currency} /> : null}
            {v.representation ? <Leader label="Client entertainment" amount={v.representation} currency={a.currency} /> : null}
            {toCheck ? (
              <Maybe href={toCheckHref} className="-mx-2 flex min-h-11 items-center gap-1 rounded-[8px] px-2">
                <span className="flex-1 type-caption text-[var(--ink)]">{`To check (${toCheck.count})`}</span>
                <span className="type-amount-row text-[var(--ink)]">{money(toCheck.amount, a.currency)}</span>
                <Chevron show={toCheckHref != null} />
              </Maybe>
            ) : null}
          </div>
        ) : null}
        <p className="pt-1 type-caption text-[var(--ink-muted)]">
          {v.mode === "se"
            ? "What the receipts say, not your VAT return. What can be deducted depends on your VAT registration and on what each purchase was for: your accountant decides, client entertainment included. To check: receipts not confirmed yet, or a rate that isn't Swedish or couldn't be read."
            : "What the receipts say, not your VAT return. Your accountant decides what can be deducted."}
        </p>
        {v.withoutVat > 0 ? (
          <p className="type-caption text-[var(--ink-muted)]">
            {plural(v.withoutVat, "1 receipt has no VAT recorded", "{count} receipts have no VAT recorded")}
          </p>
        ) : null}
        {v.foreign > 0 ? (
          <p className="type-caption text-[var(--ink-muted)]">
            {plural(
              v.foreign,
              "1 receipt in another currency: its VAT isn't counted",
              "{count} receipts in another currency: their VAT isn't counted",
            )}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Quality({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  const q = a.quality;
  const rows = [
    q.missingAmount > 0
      ? { text: plural(q.missingAmount, "1 receipt without an amount", "{count} receipts without an amount"), to: href({ quality: "missing_amount" }) }
      : null,
    q.unconverted > 0
      ? {
          text: plural(q.unconverted, "1 receipt in another currency, not converted yet", "{count} receipts in another currency, not converted yet"),
          to: href({ quality: "unconverted" }),
        }
      : null,
    // Undated receipts are in no period, so there is no list to open here.
    q.undated > 0 ? { text: plural(q.undated, "1 receipt without a date (in no period)", "{count} receipts without a date (in no period)"), to: null } : null,
  ].filter((r): r is { text: string; to: string | null } => r != null);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="quality-title">
      <SectionTitle id="quality-title">Not in these numbers</SectionTitle>
      <ul className={`${CARD} divide-y divide-[var(--hairline)]`}>
        {rows.map((r) => (
          <li key={r.text}>
            <Maybe href={r.to} className={ROW}>
              <span className="flex-1 type-caption text-[var(--ink)]">{r.text}</span>
              <Chevron show={r.to != null} />
            </Maybe>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InsightsBody({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  if (a.total.count === 0 && a.quality.missingAmount === 0 && a.total.unconverted.length === 0) {
    return (
      <div className={`${CARD} mt-6 px-4 py-5`}>
        <p className="type-body-lg text-[var(--ink)]">Nothing in this period</p>
        <p className="mt-1 type-caption font-normal text-[var(--ink-muted)]">
          Receipts dated in this period will show here, with where the money goes and the VAT on them.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <Hero a={a} href={href} />
      <div>
        <BarChart a={a} />
        {a.total.count < 3 ? (
          <div className="mt-4">
            <p className="text-[15px] font-bold text-[var(--ink)]">A few more receipts first</p>
            <p className="type-caption font-normal text-[var(--ink-muted)]">
              Charts and findings start making sense from about three receipts in a period.
            </p>
          </div>
        ) : null}
      </div>
      <Findings a={a} href={href} />
      <Categories a={a} href={href} />
      <Merchants a={a} href={href} />
      <VatPanel a={a} href={href} />
      <Quality a={a} href={href} />
    </div>
  );
}
