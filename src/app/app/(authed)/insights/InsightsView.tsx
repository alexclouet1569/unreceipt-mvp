// The website's Analysis page body (DESIGN.md "Charts and Analysis"): what
// was spent and how many receipts, by category, over time, top merchants,
// highlights, the VAT on the receipts (closed until asked) and the receipts
// in no period. No comparison with earlier periods: the arrows show them. No hooks and no server code,
// so the page (a server component) and the demo tour (in the browser) both
// render it. Hairline cards, no shadows; mint only for the VAT panel;
// amounts in Geist Mono, also inside sentences.

import Link from "next/link";
import { ChevronRight, Copy, Repeat, Sparkles, TrendingUp, Trophy, Utensils } from "lucide-react";
import type { AnalyticsInsight } from "@/lib/mobile/types";
import {
  categoryColor,
  categoryLabel,
  fillParts,
  insightFilter,
  insightText,
  money,
  percentText,
  plural,
  shareText,
  type Part,
  type ReadyAnalytics,
} from "@/lib/analytics/display";
import { getMerchantColor, getMerchantInitials } from "@/lib/merchant-display";
import { BarChart } from "@/components/charts/Charts";
import { Donut } from "@/components/charts/Donut";

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

/** One of the summary's two figures: a label and a big value, opening the receipts. */
function Figure({ label, value, mono, approx, to, aria }: { label: string; value: string; mono: boolean; approx?: boolean; to: string | null; aria: string }) {
  // Half a card's width: long amounts step down rather than wrap.
  const size = value.length > 12 ? "text-[18px]" : value.length > 8 ? "text-[22px]" : "text-[30px]";
  return (
    <Maybe href={to} label={aria} className="flex min-h-[96px] flex-col justify-center gap-1 px-4 py-3.5">
      <span className="type-micro text-[var(--ink-muted)]">{label}</span>
      <span className="flex items-baseline gap-1 whitespace-nowrap leading-[1.1]">
        {approx ? (
          <span aria-hidden="true" className={`font-mono text-[var(--ink-muted)] ${size}`}>
            ≈
          </span>
        ) : null}
        <span
          className={
            (mono ? "font-mono font-medium tabular-nums" : "font-display font-bold") +
            ` tracking-[-0.02em] text-[var(--ink)] ${size}`
          }
        >
          {value}
        </span>
      </span>
    </Maybe>
  );
}

/**
 * The three answers' first two: what was spent and how many receipts, side
 * by side and the same size; under them, only when it applies, what the
 * total leaves out or still waits for (each opens its receipts).
 */
function Summary({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  const total = money(a.total.amount, a.currency);
  const all = href({});
  const count = plural(a.total.count, "1 receipt", "{count} receipts");
  const unconverted = a.total.unconverted.map((l) => money(l.amount, l.currency)).join(" + ");
  const notes: { key: string; parts: Part[]; to: string | null }[] = [];
  if (a.total.toConfirm > 0) {
    notes.push({
      key: "confirm",
      parts: [{ text: plural(a.total.toConfirm, "1 receipt to confirm", "{count} receipts to confirm") }],
      to: href({ quality: "to_confirm" }),
    });
  }
  if (a.quality.missingAmount > 0) {
    notes.push({
      key: "amount",
      parts: [
        {
          text: plural(
            a.quality.missingAmount,
            "1 receipt without an amount, not in the total",
            "{count} receipts without an amount, not in the total",
          ),
        },
      ],
      to: href({ quality: "missing_amount" }),
    });
  }
  if (unconverted) {
    notes.push({
      key: "unconverted",
      parts: fillParts("{amounts} in another currency, not converted yet", {}, { amounts: unconverted }),
      to: href({ quality: "unconverted" }),
    });
  }
  return (
    <section aria-label="This period" className={CARD}>
      <div className="grid grid-cols-2 divide-x divide-[var(--hairline)]">
        <Figure
          label="Spent"
          value={total}
          mono
          approx={a.total.estimate}
          to={all}
          aria={`Spent: ${a.total.estimate ? "about " : ""}${total}. Show the receipts.`}
        />
        <Figure label="Receipts" value={String(a.total.count)} mono={false} to={all} aria={`${count}. Show them.`} />
      </div>
      {notes.length > 0 ? (
        <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {notes.map((n) => (
            <li key={n.key}>
              <Maybe href={n.to} className="flex min-h-11 items-center gap-2 px-4 py-2.5">
                <span className="flex-1 type-caption text-[var(--ink)]">
                  <Parts parts={n.parts} />
                </span>
                <Chevron show={n.to != null} />
              </Maybe>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
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
      <SectionTitle id="findings-title">Highlights</SectionTitle>
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

/** "42% · 3 receipts" under a category's or a merchant's name. */
function rowDetail(count: number, share: number | null): string {
  const receipts = plural(count, "1 receipt", "{count} receipts");
  return share != null && share > 0 ? `${shareText(share)} · ${receipts}` : receipts;
}

function Categories({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  const shown = a.categories.filter((c) => c.count > 0);
  if (shown.length === 0) return null;
  const withAmount = shown.filter((c) => c.amount > 0);
  return (
    <section aria-labelledby="where-title">
      <SectionTitle id="where-title">By category</SectionTitle>
      <div className={CARD}>
        {withAmount.length > 0 ? (
          <div className="border-b border-[var(--hairline)] px-4 py-5">
            <Donut
              slices={withAmount.map((c) => ({ key: c.category, share: c.share, color: categoryColor(c.category) }))}
              centre={money(a.total.amount, a.currency)}
              caption={plural(withAmount.length, "1 category", "{count} categories")}
            />
          </div>
        ) : null}
        <ul className="divide-y divide-[var(--hairline)]">
          {shown.map((c) => {
            const label = categoryLabel(c.category);
            const to = href({ category: c.category });
            return (
              <li key={c.category}>
                <Maybe href={to} className={ROW}>
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: categoryColor(c.category) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[var(--ink)]">{label}</span>
                    <span className="block type-caption text-[var(--ink-muted)]">{rowDetail(c.count, c.share)}</span>
                  </span>
                  <span className="type-amount-row text-[var(--ink)]">{money(c.amount, a.currency)}</span>
                  <Chevron show={to != null} />
                </Maybe>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Top merchants shown before "Show more" (all of them when only one more would hide). */
const MERCHANTS_SHOWN = 5;

function MerchantRow({ m, a, href }: { m: ReadyAnalytics["merchants"][number]; a: ReadyAnalytics; href: DrillHref }) {
  const to = href({ merchant: m.key });
  const share = m.share ?? (a.total.amount > 0 ? m.amount / a.total.amount : 0);
  return (
    <li>
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
          <span className="block type-caption text-[var(--ink-muted)]">{rowDetail(m.count, share)}</span>
        </span>
        <span className="type-amount-row text-[var(--ink)]">{money(m.amount, a.currency)}</span>
        <Chevron show={to != null} />
      </Maybe>
    </li>
  );
}

function Merchants({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  if (a.merchants.length === 0) return null;
  const cut = a.merchants.length > MERCHANTS_SHOWN + 1 ? MERCHANTS_SHOWN : a.merchants.length;
  const first = a.merchants.slice(0, cut);
  const more = a.merchants.slice(cut);
  return (
    <section aria-labelledby="merchants-title">
      <SectionTitle id="merchants-title">Top merchants</SectionTitle>
      <div className={CARD}>
        <ul className="divide-y divide-[var(--hairline)]">
          {first.map((m) => (
            <MerchantRow key={m.key} m={m} a={a} href={href} />
          ))}
        </ul>
        {more.length > 0 ? (
          <details className="group border-t border-[var(--hairline)]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 px-4 type-caption font-semibold text-[var(--ink)] outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">{`Show ${more.length} more`}</span>
              <span className="hidden group-open:inline">Show fewer</span>
            </summary>
            <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
              {more.map((m) => (
                <MerchantRow key={m.key} m={m} a={a} href={href} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
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

const rateText = (rate: number | null) => (rate == null ? "Rate unknown" : `VAT ${percentText(rate)}`);

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
      <SectionTitle id="vat-title">VAT</SectionTitle>
      {/* Closed until asked: one line with the total, the detail on a tap. */}
      <details className="group rounded-[12px] bg-[var(--brand-tint)]">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 rounded-[12px] px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
          <span className="flex-1 text-[15px] font-bold text-[var(--ink)]">VAT on these receipts</span>
          <span className="type-amount-row text-[var(--ink)]">{money(v.total, a.currency)}</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform group-open:rotate-90" />
        </summary>
      <div className="space-y-2 px-3.5 pb-3.5">
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
            {v.swedish != null ? <Leader label="Swedish rates, confirmed receipts" amount={v.swedish} currency={a.currency} /> : null}
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
            ? "What the receipts say, not your VAT return: your accountant decides what can be deducted, client entertainment included. To check: receipts not confirmed yet, or a rate that isn't Swedish or couldn't be read."
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
      </details>
    </section>
  );
}

/** Receipts without a date are in no period: said once, under everything. */
function Undated({ a }: { a: ReadyAnalytics }) {
  const n = a.quality.undated;
  if (n === 0) return null;
  return (
    <p className="type-caption text-[var(--ink-muted)]">
      {plural(n, "1 receipt has no date, so it isn't in any period.", "{count} receipts have no date, so they aren't in any period.")}
    </p>
  );
}

export function InsightsBody({ a, href }: { a: ReadyAnalytics; href: DrillHref }) {
  if (a.total.count === 0) {
    return (
      <div className={`${CARD} mt-6 px-4 py-5`}>
        <p className="type-body-lg text-[var(--ink)]">Nothing in this period</p>
        <p className="mt-1 type-caption font-normal text-[var(--ink-muted)]">
          Receipts dated in this period will show here: what you spent, how many receipts and in which categories.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <div>
        <Summary a={a} href={href} />
        {a.total.count < 3 ? (
          <p className="mt-2 type-caption text-[var(--ink-muted)]">Add a few more receipts to see a clearer picture.</p>
        ) : null}
      </div>
      <Categories a={a} href={href} />
      <section aria-labelledby="time-title">
        <SectionTitle id="time-title">Over time</SectionTitle>
        <BarChart a={a} />
      </section>
      <Merchants a={a} href={href} />
      <Findings a={a} href={href} />
      <VatPanel a={a} href={href} />
      <Undated a={a} />
    </div>
  );
}
