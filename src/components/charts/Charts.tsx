"use client";

// The Insights page's chart, hand-built in SVG (DESIGN.md "Charts and
// Insights"), the same as the iPhone app's: weekly bars for a month (7-day
// blocks from the 1st), Monday weeks for a quarter, months for a year.
// Bars --ink-muted; the chosen bar (or the current one) is the screen's one
// green; the period before in --ink-faint, beside each bar when there are
// 8 or fewer, behind it when more, with a legend; a hairline baseline, no
// grid, no axis numbers, no gradients, no shadows.
//
// Reading a chart: move the pointer (or a finger) along it, or focus it and
// use the arrow keys; the readout above names the bar. It clears 1.6 s after
// the pointer leaves. Never past today.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  bucketLabel,
  partsText,
  periodTitle,
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

/** Bars per day, week or month, with the period before beside or behind them. */
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
  const before = sel != null && a.previousBuckets.length > sel ? a.previousBuckets[sel] : null;
  const parts: Part[] | null =
    sel != null
      ? [
          { text: `${bucketLabel(a.buckets[sel], a.granularity, true)} · ` },
          { text: money(a.buckets[sel].amount), money: true },
          ...(before != null ? [{ text: ` · ${previousLabel(a)} ` }, { text: money(before), money: true }] : []),
        ]
      : null;

  const slot = width / Math.max(1, n);
  // Few bars (a month's weeks, a quarter's months…): last period's bar
  // stands beside this one. Many: it sits behind, a little wider.
  const paired = a.previousBuckets.length > 0 && n <= 8;
  const barW = paired ? Math.min(30, slot * 0.34) : Math.max(2, Math.min(28, slot * 0.62));
  const gap = 4;

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
              const h = Math.max(v > 0 ? 3 : 0, (v / max) * (HEIGHT - 8));
              if (h <= 0) return null;
              const x = paired ? i * slot + slot / 2 - gap / 2 - barW : i * slot + (slot - barW) / 2 - 2;
              return (
                <rect key={`p${i}`} x={x} y={HEIGHT - h} width={paired ? barW : barW + 4} height={h} rx={3} fill="var(--ink-faint)" />
              );
            })}
            {a.buckets.map((b, i) => {
              if (i >= visible) return null;
              const h = Math.max(b.amount > 0 ? 3 : 0, (b.amount / max) * (HEIGHT - 8));
              if (h <= 0) return null;
              const x = paired ? i * slot + slot / 2 + gap / 2 : i * slot + (slot - barW) / 2;
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
      {a.previousBuckets.length > 0 ? (
        <div aria-hidden="true" className="mt-2 flex items-center gap-1.5 type-caption text-[var(--ink-muted)]">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--ink-muted)]" />
          {periodTitle(a.period)}
          <span className="ml-3 h-2.5 w-2.5 rounded-[3px] bg-[var(--ink-faint)]" />
          {previousLabel(a)}
        </div>
      ) : null}
    </div>
  );
}
