"use client";

// The Insights page's two charts, hand-built in SVG (DESIGN.md "Charts and
// Insights"): bars for a quarter, a year or chosen dates, and a running
// total for a month. Bars --ink-muted; the chosen bar (or today's) is the
// screen's one green; the period before as --hairline ghosts; a hairline
// baseline, no grid, no axis numbers, no gradients, no shadows.
//
// Reading a chart: move the pointer (or a finger) along it, or focus it and
// use the arrow keys; the readout above names the bar. It clears 1.6 s after
// the pointer leaves. Never past today.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  bucketLabel,
  cumulative,
  monthName,
  partsText,
  previousLabel,
  todayIndex,
  money as formatMoney,
  type Part,
  type ReadyAnalytics,
} from "@/lib/analytics/display";

const HEIGHT = 140;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** The chosen index, from the pointer or the keyboard; null when none. */
function useScrub(count: number, width: number, last: number) {
  const [selected, setSelected] = useState<number | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pick = (i: number | null) => {
    if (clear.current) clearTimeout(clear.current);
    setSelected(i == null ? null : Math.max(0, Math.min(last, i)));
  };
  useEffect(() => () => {
    if (clear.current) clearTimeout(clear.current);
  }, []);
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (width <= 0 || count <= 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    pick(Math.floor(((e.clientX - box.left) / box.width) * count));
  };
  const handlers = {
    onPointerMove: fromPointer,
    onPointerDown: fromPointer,
    onPointerLeave: () => {
      if (clear.current) clearTimeout(clear.current);
      clear.current = setTimeout(() => setSelected(null), 1600);
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
      if (e.key === "Home") pick(0);
      else if (e.key === "End") pick(last);
      else if (e.key === "Escape") pick(null);
      else if (step !== 0) pick((selected ?? (step > 0 ? -1 : last + 1)) + step);
      else return;
      e.preventDefault();
    },
    onBlur: () => pick(null),
  };
  return { selected, handlers };
}

/** The line above a chart: words in Manrope, amounts in Geist Mono. */
function Readout({ parts }: { parts: Part[] | null }) {
  return (
    <p aria-hidden="true" className="flex min-h-[40px] items-end type-caption text-[var(--ink-muted)]">
      <span>
        {parts?.map((p, i) =>
          p.money ? (
            <span key={i} className="font-mono text-[13px] text-[var(--ink)] tabular-nums">
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </span>
    </p>
  );
}

/** Bar labels on their bar, every n-th one so none is cut (by measured length). */
function AxisLabels({ labels, width }: { labels: string[]; width: number }) {
  const n = labels.length;
  const slot = width / Math.max(1, n);
  const longest = Math.max(...labels.map((l) => l.length), 1);
  const every = Math.max(1, Math.ceil((longest * 6 + 8) / Math.max(1, slot)));
  return (
    <div aria-hidden="true" className="relative mt-1 h-4">
      {labels.map((l, i) =>
        i % every === 0 ? (
          <span
            key={i}
            className="absolute top-0 text-center text-[10px] leading-[13px] font-medium text-[var(--ink-muted)]"
            style={{ left: i * slot + slot / 2 - (slot * every) / 2, width: slot * every }}
          >
            {l}
          </span>
        ) : null,
      )}
    </div>
  );
}

const plotClass =
  "relative touch-pan-y rounded-[6px] outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-background";

/** Bars per day, week or month, with the period before as ghosts. */
export function BarChart({ a }: { a: ReadyAnalytics }) {
  const { ref, width } = useWidth();
  const n = a.buckets.length;
  const today = todayIndex(a);
  const visible = a.period.current ? (today >= 0 ? today + 1 : n) : n;
  const max = Math.max(1, ...a.buckets.map((b) => b.amount), ...a.previousBuckets);
  const money = (v: number) => formatMoney(v, a.currency);
  const { selected: sel, handlers } = useScrub(n, width, Math.max(0, visible - 1));

  const highest = a.buckets.reduce((best, b, i) => (b.amount > a.buckets[best].amount ? i : best), 0);
  const summary = `${n} bars. Highest: ${bucketLabel(a.buckets[highest], a.granularity, true)}, ${money(a.buckets[highest].amount)}.`;
  const parts: Part[] | null =
    sel != null
      ? [{ text: `${bucketLabel(a.buckets[sel], a.granularity, true)} · ` }, { text: money(a.buckets[sel].amount), money: true }]
      : null;

  const slot = width / Math.max(1, n);
  const barW = Math.max(2, Math.min(28, slot * 0.62));

  return (
    <div>
      <Readout parts={parts} />
      <div
        ref={ref}
        // One adjustable control, as on the iPhone: the summary is its name,
        // the chosen bar its value; arrow keys move bar by bar.
        role="slider"
        tabIndex={0}
        aria-label={summary}
        aria-roledescription="chart"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, visible - 1)}
        aria-valuenow={sel ?? Math.max(0, today >= 0 ? today : visible - 1)}
        aria-valuetext={parts ? partsText(parts) : summary}
        className={plotClass}
        style={{ height: HEIGHT }}
        {...handlers}
      >
        {width > 0 ? (
          <svg width={width} height={HEIGHT} aria-hidden="true" className="block">
            <line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="var(--hairline)" strokeWidth={1} />
            {a.previousBuckets.slice(0, n).map((v, i) => {
              const h = (v / max) * (HEIGHT - 8);
              if (h <= 0) return null;
              const x = i * slot + (slot - barW) / 2 - 2;
              return <rect key={`p${i}`} x={x} y={HEIGHT - h} width={barW + 4} height={h} rx={3} fill="var(--hairline)" />;
            })}
            {a.buckets.map((b, i) => {
              if (i >= visible) return null;
              const h = Math.max(b.amount > 0 ? 3 : 0, (b.amount / max) * (HEIGHT - 8));
              if (h <= 0) return null;
              const x = i * slot + (slot - barW) / 2;
              const on = sel != null ? i === sel : i === today;
              return (
                <rect
                  key={i}
                  x={x}
                  y={HEIGHT - h}
                  width={barW}
                  height={h}
                  rx={3}
                  fill={on ? "var(--brand-action)" : "var(--ink-muted)"}
                  // The others dim while one is chosen, so the choice reads by
                  // lightness too, not only by hue.
                  opacity={sel != null && !on ? 0.45 : 1}
                />
              );
            })}
          </svg>
        ) : null}
      </div>
      {width > 0 ? <AxisLabels labels={a.buckets.map((b) => bucketLabel(b, a.granularity))} width={width} /> : null}
    </div>
  );
}

/**
 * A month as a running total: this month's line up to today, last month's
 * behind it in --ink-faint, so "am I spending faster?" reads at a glance.
 */
export function PaceChart({ a }: { a: ReadyAnalytics }) {
  const { ref, width } = useWidth();
  const n = a.buckets.length;
  const today = todayIndex(a);
  const lastDay = a.period.current ? Math.max(0, today) : n - 1;
  const now = cumulative(a.buckets.map((b) => b.amount));
  // Last month drawn over this month's days only (October has 31, November 30).
  const before = cumulative(a.previousBuckets).slice(0, n);
  const max = Math.max(1, ...now.slice(0, lastDay + 1), ...before);
  const money = (v: number) => formatMoney(v, a.currency);
  const { selected: sel, handlers } = useScrub(n, width, lastDay);
  const nowName = monthName(a.period.from, a.today);
  const beforeName = previousLabel(a);

  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * (width - 8) + 4);
  const y = (v: number) => HEIGHT - 4 - (v / max) * (HEIGHT - 12);
  const path = (values: number[], upTo: number) =>
    values
      .slice(0, upTo + 1)
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

  const at = sel ?? lastDay;
  const shownBefore = before.length > 0 ? before[Math.min(at, before.length - 1)] : null;
  const parts: Part[] | null =
    sel != null
      ? [
          { text: `By ${bucketLabel(a.buckets[at], "day", true)} · ` },
          { text: money(now[at]), money: true },
          ...(shownBefore != null ? [{ text: ` · ${beforeName} ` }, { text: money(shownBefore), money: true }] : []),
        ]
      : null;
  const lastName = bucketLabel(a.buckets[lastDay], "day", true);
  const summary =
    before.length > 0
      ? `${money(now[lastDay])} by ${lastName}. ${beforeName}: ${money(before[Math.min(lastDay, before.length - 1)])} by the same day.`
      : `${money(now[lastDay])} by ${lastName}.`;

  return (
    <div>
      <Readout parts={parts} />
      <div
        ref={ref}
        // One adjustable control, as on the iPhone: the summary is its name,
        // the chosen bar its value; arrow keys move bar by bar.
        role="slider"
        tabIndex={0}
        aria-label={summary}
        aria-roledescription="chart"
        aria-valuemin={0}
        aria-valuemax={lastDay}
        aria-valuenow={sel ?? lastDay}
        aria-valuetext={parts ? partsText(parts) : summary}
        className={plotClass}
        style={{ height: HEIGHT }}
        {...handlers}
      >
        {width > 0 ? (
          <svg width={width} height={HEIGHT} aria-hidden="true" className="block overflow-visible">
            <line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="var(--hairline)" strokeWidth={1} />
            {before.length > 1 ? (
              <path d={path(before, before.length - 1)} stroke="var(--ink-faint)" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            <path d={path(now, lastDay)} stroke="var(--brand-action)" strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {sel != null ? <line x1={x(at)} x2={x(at)} y1={4} y2={HEIGHT} stroke="var(--hairline)" strokeWidth={1} /> : null}
            <circle cx={x(Math.min(at, lastDay))} cy={y(now[Math.min(at, lastDay)])} r={4.5} fill="var(--brand-action)" stroke="var(--card)" strokeWidth={2} />
          </svg>
        ) : null}
      </div>
      <div aria-hidden="true" className="mt-2 flex items-center gap-1.5 type-caption text-[var(--ink-muted)]">
        <span className="h-[3px] w-3.5 rounded-full bg-[var(--brand-action)]" />
        {nowName}
        {before.length > 1 ? (
          <>
            <span className="ml-3 h-[3px] w-3.5 rounded-full bg-[var(--ink-faint)]" />
            {beforeName}
          </>
        ) : null}
      </div>
    </div>
  );
}
