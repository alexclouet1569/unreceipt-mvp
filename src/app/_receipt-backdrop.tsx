"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/locale";

/**
 * Landing-page backdrop: one long thermal receipt that runs down the
 * page behind the content and prints as the visitor scrolls. The green
 * hero acts as the printer — the paper comes out of its slot and a
 * print head travels down with the viewport. As the head passes a line:
 *
 *   - the line types in left to right, in green "wet" ink that develops
 *     to navy, like thermal paper;
 *   - its amount counts up from zero;
 *   - the running subtotal carried by the print head ticks up.
 *
 * When the last line prints, the paper tears off and a VAT-READY stamp
 * lands on the total. Scrolling back up feeds the paper back in.
 *
 * Purely decorative (aria-hidden). The scroll handler writes straight
 * to the DOM (CSS variables, class toggles, text) so scrolling never
 * re-renders React.
 */

export type ReceiptRow =
  | { kind: "item"; label: string; amount: number; sum?: boolean }
  | { kind: "text"; label: string; value: string }
  | { kind: "total"; label: string; amount: number }
  | { kind: "rule" }
  | { kind: "head" }
  | { kind: "foot" };

type Line = { label: string; amount: number };

/** What the receipt says, per page language. */
type ReceiptText = {
  /** Shown after the running subtotal on the print head. */
  currency: string;
  place: string;
  ticket: string;
  thanks: string;
  /** Eight purchases, two per gap between sections. */
  items: [Line, Line, Line, Line, Line, Line, Line, Line];
  total: string;
  vat: Line;
  lost: string;
  chasing: string;
  stress: string;
  stamp: string;
};

// Swedish shops in kronor; the English page shows the same receipt.
const SWEDISH_ITEMS: ReceiptText["items"] = [
  { label: "ICA Maxi", amount: 342 },
  { label: "SJ Stockholm–Göteborg", amount: 895 },
  { label: "Spotify Business", amount: 129 },
  { label: "Scandic Hotel", amount: 1250 },
  { label: "Uber", amount: 189 },
  { label: "Apoteket", amount: 212 },
  { label: "Coop Konferens", amount: 890 },
  { label: "Pressbyrån", amount: 68 },
];

const TEXT: Record<Locale, ReceiptText> = {
  en: {
    currency: "kr",
    place: "unreceipt.com · Stockholm",
    ticket: "Kvitto #0042 · 14.10.2026 09:41",
    thanks: "Tack! Paper is past.",
    items: SWEDISH_ITEMS,
    total: "Summa",
    vat: { label: "Varav moms", amount: 795 },
    lost: "Lost receipts",
    chasing: "Hours chasing",
    stress: "Total stress",
    stamp: "✓ VAT-ready",
  },
  sv: {
    currency: "kr",
    place: "unreceipt.com · Stockholm",
    ticket: "Kvitto #0042 · 14.10.2026 09:41",
    thanks: "Tack! Paper is past.",
    items: SWEDISH_ITEMS,
    total: "Summa",
    vat: { label: "Varav moms", amount: 795 },
    lost: "Borttappade kvitton",
    chasing: "Timmar på kvittojakt",
    stress: "Stress totalt",
    stamp: "✓ Kontrollerat",
  },
  fr: {
    currency: "€",
    place: "unreceipt.com · Paris",
    ticket: "Ticket n° 0042 · 14/10/2026 09:41",
    thanks: "Merci\u00a0! Le papier, c’est du passé.",
    items: [
      { label: "Paul", amount: 18.5 },
      { label: "SNCF Paris–Lyon", amount: 64 },
      { label: "Spotify", amount: 11.99 },
      { label: "Ibis Paris", amount: 89 },
      { label: "Uber", amount: 23.4 },
      { label: "Pharmacie", amount: 8.9 },
      { label: "Carrefour", amount: 42 },
      { label: "Relay", amount: 4.5 },
    ],
    total: "Total TTC",
    vat: { label: "Dont TVA", amount: 23.62 },
    lost: "Tickets perdus",
    chasing: "Heures de relance",
    stress: "Stress total",
    stamp: "✓ Vérifié",
  },
};

function receiptFor(locale: Locale) {
  const t = TEXT[locale];
  const item = (i: number) => ({ kind: "item" as const, ...t.items[i] });
  const total = Math.round(t.items.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  return {
    top: [{ kind: "head" }, { kind: "rule" }],
    features: [item(0), item(1)],
    how: [item(2), item(3)],
    difference: [item(4), item(5)],
    pricing: [item(6), item(7), { kind: "rule" }],
    about: [
      { kind: "total", label: t.total, amount: total },
      { kind: "item", label: t.vat.label, amount: t.vat.amount, sum: false },
      { kind: "rule" },
    ],
    badges: [
      { kind: "text", label: t.lost, value: "0" },
      { kind: "text", label: t.chasing, value: "0,00" },
    ],
    end: [{ kind: "rule" }, { kind: "text", label: t.stress, value: "0,00" }, { kind: "foot" }],
  } satisfies Record<string, ReceiptRow[]>;
}

/** Receipt content per page language, keyed by where it sits on the page. */
export const RECEIPT: Record<Locale, ReturnType<typeof receiptFor>> = {
  en: receiptFor("en"),
  sv: receiptFor("sv"),
  fr: receiptFor("fr"),
};

const kr = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A few receipt lines, rendered in the page flow between two sections so
 * they sit on the paper without ever overlapping section content.
 */
export function ReceiptRows({ rows, locale = "en" }: { rows: ReceiptRow[]; locale?: Locale }) {
  return (
    <div className="rb-group" aria-hidden="true">
      {rows.map((row, i) => {
        switch (row.kind) {
          case "rule":
            return <div key={i} className="rb-rule" data-print />;
          case "head":
            return (
              <div key={i} className="rb-head" data-print>
                <p className="rb-brand">UnReceipt</p>
                <p className="rb-meta">{TEXT[locale].place}</p>
                <p className="rb-meta rb-mono">{TEXT[locale].ticket}</p>
              </div>
            );
          case "foot":
            return (
              <div key={i} className="rb-foot" data-print>
                <span className="rb-stamp">{TEXT[locale].stamp}</span>
                <div className="rb-barcode" />
                <p className="rb-thanks">{TEXT[locale].thanks}</p>
              </div>
            );
          case "text":
            return (
              <div key={i} className="rb-row rb-strong-soft" data-print>
                <span className="rb-label">{row.label}</span>
                <span className="rb-dots" />
                <span className="rb-mono">{row.value}</span>
              </div>
            );
          default:
            return (
              <div
                key={i}
                className={`rb-row ${row.kind === "total" ? "rb-total" : ""}`}
                data-print
                data-amount={row.amount}
                data-sum={row.kind === "item" && row.sum !== false ? "" : undefined}
              >
                <span className="rb-label">{row.label}</span>
                <span className="rb-dots" />
                <span className="rb-mono" data-count>
                  {kr.format(row.amount)}
                </span>
              </div>
            );
        }
      })}
    </div>
  );
}

// The print head sits this far down the viewport.
const HEAD = 0.82;
const COUNT_MS = 700;

export function ReceiptBackdrop({ locale = "en" }: { locale?: Locale }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const subtotalRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const currency = TEXT[locale].currency;
    const root = rootRef.current;
    const subtotalEl = subtotalRef.current;
    if (!root || !subtotalEl) return;
    const scope = root.parentElement ?? root;
    const lines = Array.from(scope.querySelectorAll<HTMLElement>("[data-print]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Count-up tweens for amounts, keyed by line.
    const tweens = new Map<HTMLElement, number>();
    const countUp = (line: HTMLElement) => {
      const out = line.querySelector<HTMLElement>("[data-count]");
      const target = Number(line.dataset.amount);
      if (!out || Number.isNaN(target)) return;
      if (reduced) {
        out.textContent = kr.format(target);
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / COUNT_MS);
        const eased = 1 - Math.pow(1 - k, 3);
        out.textContent = kr.format(target * eased);
        if (k < 1) tweens.set(line, requestAnimationFrame(tick));
        else tweens.delete(line);
      };
      tweens.set(line, requestAnimationFrame(tick));
    };
    const reset = (line: HTMLElement) => {
      const raf = tweens.get(line);
      if (raf) cancelAnimationFrame(raf);
      tweens.delete(line);
      const out = line.querySelector<HTMLElement>("[data-count]");
      if (out) out.textContent = kr.format(0);
    };

    let shownSubtotal = -1;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const height = rect.height;
      // The receipt tears off as soon as its last line is out, rather
      // than when the (empty) bottom margin of the paper reaches the head.
      const last = lines[lines.length - 1]?.getBoundingClientRect();
      const tearAt = last ? Math.min(height, last.top + last.height / 2 - rect.top) : height;
      const head = reduced ? height : Math.max(0, window.innerHeight * HEAD - rect.top);
      const done = head >= tearAt;
      const printed = done ? height : Math.min(head, height);
      root.style.setProperty("--printed", `${printed}px`);
      root.classList.toggle("is-done", done);
      root.classList.toggle("is-printing", printed > 0 && !done);

      let subtotal = 0;
      for (const line of lines) {
        const r = line.getBoundingClientRect();
        const isPrinted = r.top + r.height / 2 - rect.top <= printed;
        if (isPrinted !== line.classList.contains("is-printed")) {
          line.classList.toggle("is-printed", isPrinted);
          if (line.dataset.amount) {
            if (isPrinted) countUp(line);
            else reset(line);
          }
        }
        if (isPrinted && line.dataset.sum !== undefined) {
          subtotal += Number(line.dataset.amount);
        }
      }
      if (subtotal !== shownSubtotal) {
        shownSubtotal = subtotal;
        subtotalEl.textContent = `${kr.format(subtotal)}\u00a0${currency}`;
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    // Amounts start at zero once JS runs; the server render shows the
    // full amounts so the receipt still reads without JS.
    if (!reduced) for (const line of lines) if (line.dataset.amount) reset(line);
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(scope);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      for (const raf of tweens.values()) cancelAnimationFrame(raf);
    };
  }, [locale]);

  return (
    <div ref={rootRef} className="receipt-backdrop" aria-hidden="true">
      <div className="rb-slot" />
      <div className="rb-paper" />
      <div className="rb-printhead">
        <span ref={subtotalRef} className="rb-subtotal rb-mono" />
      </div>

      <style jsx global>{`
        /* Set on the wrapper that holds both the backdrop and the
           in-flow row groups, so both agree on the paper width. */
        .receipt-scope {
          --paper-w: clamp(280px, 40vw, 400px);
        }
        @media (max-width: 640px) {
          .receipt-scope {
            --paper-w: 86vw;
          }
        }
        .receipt-backdrop {
          --printed: 0px;
          position: absolute;
          inset: 0 0 40px 0;
          z-index: -1;
          pointer-events: none;
        }
        /* Printer slot, tucked under the hero's bottom edge. */
        .rb-slot {
          position: absolute;
          top: -5px;
          left: 50%;
          transform: translateX(-50%);
          width: calc(var(--paper-w) + 36px);
          height: 9px;
          border-radius: 6px;
          background: #303568;
          z-index: 1;
        }
        /* Paper: no hard border. The edges fade into the page so it reads
           as a surface rather than a column cutting through content, with
           a faint thermal-paper grain. */
        .rb-paper {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: calc(var(--paper-w) + 48px);
          transform: translateX(-50%);
          background:
            repeating-linear-gradient(180deg, rgba(48, 53, 104, 0.02) 0 1px, transparent 1px 4px),
            #ffffff;
          -webkit-mask: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent);
          mask: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent);
          clip-path: inset(0 0 calc(100% - var(--printed)) 0);
        }
        /* Torn bottom edge once the whole receipt is out. */
        .receipt-backdrop.is-done .rb-paper {
          -webkit-mask:
            linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent) 0 0 / 100% calc(100% - 8px) no-repeat,
            conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 24px 100% / 14px 8px repeat-x;
          mask:
            linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent) 0 0 / 100% calc(100% - 8px) no-repeat,
            conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 24px 100% / 14px 8px repeat-x;
        }
        /* Thermal print head: a thin green glow riding the paper's edge,
           carrying the running subtotal. */
        .rb-printhead {
          position: absolute;
          left: 50%;
          top: var(--printed);
          width: var(--paper-w);
          height: 0;
          transform: translateX(-50%);
          opacity: 0;
          transition: opacity 300ms ease;
        }
        .receipt-backdrop.is-printing .rb-printhead {
          opacity: 1;
        }
        .rb-printhead::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 26px;
          background: linear-gradient(to bottom, rgba(39, 190, 123, 0), rgba(39, 190, 123, 0.08));
          border-bottom: 1px solid rgba(39, 190, 123, 0.4);
        }
        .rb-subtotal {
          position: absolute;
          right: 4px;
          top: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #1f9d63;
          background: #ecf7e7;
          border-radius: 999px;
          padding: 2px 8px;
        }

        /* In-flow groups of receipt lines, sitting between sections. */
        .rb-group {
          width: var(--paper-w);
          margin: 0 auto;
          padding: 8px 28px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          color: #303568;
        }
        .rb-head,
        .rb-rule,
        .rb-foot {
          opacity: 0;
          transform: translateY(6px);
          transition: opacity 500ms ease, transform 500ms ease;
        }
        .rb-head.is-printed,
        .rb-rule.is-printed,
        .rb-foot.is-printed {
          opacity: 1;
          transform: none;
        }
        /* Rows type in left to right in green "wet" ink, then develop to
           navy, like thermal paper. */
        .rb-row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          height: 28px;
          font-size: 13px;
          color: #27be7b;
          filter: blur(1.5px);
          clip-path: inset(0 100% 0 0);
          transition: clip-path 0ms 200ms, color 0ms 200ms, filter 0ms 200ms;
        }
        .rb-row.is-printed {
          color: #5a5f7a;
          filter: blur(0);
          clip-path: inset(0 0 0 0);
          transition:
            clip-path 650ms steps(16, end),
            filter 500ms ease 150ms,
            color 1100ms ease 450ms;
        }
        .rb-row.is-printed .rb-mono {
          color: #303568;
          transition: color 1100ms ease 450ms;
        }
        .rb-head {
          text-align: center;
          padding: 28px 0 10px;
        }
        .rb-brand {
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .rb-meta {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
          line-height: 1.7;
          color: #9ca0b8;
        }
        .rb-mono {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .rb-label {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rb-dots {
          flex: 1;
          border-bottom: 1px dotted #c9c6bd;
          transform: translateY(-4px);
        }
        .rb-total,
        .rb-strong-soft {
          font-weight: 800;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .rb-total.is-printed,
        .rb-strong-soft.is-printed {
          color: #303568;
        }
        .rb-total.is-printed .rb-mono,
        .rb-strong-soft.is-printed .rb-mono {
          font-weight: 600;
          font-size: 16px;
          color: #27be7b;
        }
        .rb-rule {
          border-top: 1px dashed #d9d6cc;
          margin: 8px 0;
        }
        .rb-foot {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 12px 0 8px;
        }
        .rb-barcode {
          width: 72%;
          height: 40px;
          background: repeating-linear-gradient(
            90deg,
            #303568 0 2px,
            transparent 2px 4px,
            #303568 4px 5px,
            transparent 5px 8px,
            #303568 8px 11px,
            transparent 11px 13px
          );
        }
        .rb-thanks {
          font-family: var(--font-accent), sans-serif;
          font-style: italic;
          font-size: 14px;
          color: #5a5f7a;
        }
        /* The stamp lands on the total once the receipt is complete. */
        .rb-stamp {
          position: absolute;
          right: -6px;
          top: -58px;
          padding: 4px 10px;
          border: 2px solid #27be7b;
          border-radius: 6px;
          color: #27be7b;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.85);
          opacity: 0;
          transform: rotate(-9deg) scale(1.9);
          transition:
            opacity 160ms ease 500ms,
            transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 500ms;
        }
        .rb-foot.is-printed .rb-stamp {
          opacity: 0.92;
          transform: rotate(-9deg) scale(1);
        }
        @media (max-width: 640px) {
          .rb-group {
            padding: 8px 18px;
          }
          .rb-row {
            font-size: 12px;
          }
          .rb-stamp {
            right: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rb-row,
          .rb-row.is-printed,
          .rb-row.is-printed .rb-mono,
          .rb-head,
          .rb-rule,
          .rb-foot,
          .rb-stamp {
            transition: none;
          }
          .rb-printhead {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
