"use client";

import { useEffect, useRef } from "react";

/**
 * Landing-page backdrop: one long thermal receipt that runs down the
 * page behind the content and prints as the visitor scrolls. The green
 * hero acts as the printer — the paper comes out of its slot, the print
 * head travels down with the viewport, and each line types in as the
 * head passes it. Scrolling back up feeds the paper back in.
 *
 * Purely decorative (aria-hidden). The scroll handler writes straight
 * to the DOM (one CSS variable + class toggles) so scrolling never
 * re-renders React.
 */

export type ReceiptRow =
  | { kind: "item"; label: string; value: string }
  | { kind: "strong"; label: string; value: string }
  | { kind: "rule" }
  | { kind: "head" }
  | { kind: "foot" };

/**
 * A few receipt lines, rendered in the page flow between two sections so
 * they sit on the paper without ever overlapping section content.
 */
export function ReceiptRows({ rows }: { rows: ReceiptRow[] }) {
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
                <p className="rb-meta">unreceipt.com · Stockholm</p>
                <p className="rb-meta rb-mono">Kvitto #0042 · 14.10.2026 09:41</p>
              </div>
            );
          case "foot":
            return (
              <div key={i} className="rb-foot" data-print>
                <div className="rb-barcode" />
                <p className="rb-thanks">Tack! Paper is past.</p>
              </div>
            );
          default:
            return (
              <div
                key={i}
                className={`rb-row ${row.kind === "strong" ? "rb-strong" : ""}`}
                data-print
              >
                <span className="rb-label">{row.label}</span>
                <span className="rb-dots" />
                <span className="rb-mono">{row.value}</span>
              </div>
            );
        }
      })}
    </div>
  );
}

// The print head sits this far down the viewport.
const HEAD = 0.82;

export function ReceiptBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scope = root.parentElement ?? root;
    const lines = Array.from(scope.querySelectorAll<HTMLElement>("[data-print]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const height = rect.height;
      const printed = reduced
        ? height
        : Math.max(0, Math.min(height, window.innerHeight * HEAD - rect.top));
      root.style.setProperty("--printed", `${printed}px`);
      root.classList.toggle("is-done", printed >= height - 1);
      for (const line of lines) {
        const r = line.getBoundingClientRect();
        line.classList.toggle("is-printed", r.top + r.height / 2 - rect.top <= printed);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Section reveal animations change layout after mount.
    const ro = new ResizeObserver(schedule);
    ro.observe(scope);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={rootRef} className="receipt-backdrop" aria-hidden="true">
      <div className="rb-slot" />
      <div className="rb-paper">
        <div className="rb-printhead" />
      </div>

      <style jsx global>{`
        /* Set on the wrapper that holds both the backdrop and the
           in-flow row groups, so both agree on the paper width. */
        .receipt-scope {
          --paper-w: clamp(260px, 44vw, 420px);
        }
        @media (max-width: 640px) {
          .receipt-scope {
            --paper-w: 84vw;
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
          top: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: calc(var(--paper-w) + 28px);
          height: 10px;
          border-radius: 6px;
          background: #303568;
          z-index: 1;
        }
        .rb-paper {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: var(--paper-w);
          transform: translateX(-50%);
          background: #ffffff;
          border-left: 1px solid #e8e5dd;
          border-right: 1px solid #e8e5dd;
          /* Only the printed part of the roll is visible. */
          clip-path: inset(0 -1px calc(100% - var(--printed)) -1px);
        }
        /* Torn bottom edge once the whole receipt is out. */
        .receipt-backdrop.is-done .rb-paper {
          -webkit-mask:
            linear-gradient(#000 0 0) 0 0 / 100% calc(100% - 8px) no-repeat,
            conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 0 100% / 14px 8px repeat-x;
          mask:
            linear-gradient(#000 0 0) 0 0 / 100% calc(100% - 8px) no-repeat,
            conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 0 100% / 14px 8px repeat-x;
        }
        /* Thermal print head: a faint green edge riding the paper. */
        .rb-printhead {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(var(--printed) - 32px);
          height: 32px;
          background: linear-gradient(to bottom, rgba(39, 190, 123, 0), rgba(39, 190, 123, 0.07));
          border-bottom: 1px solid rgba(39, 190, 123, 0.35);
          transition: opacity 300ms ease;
        }
        .receipt-backdrop.is-done .rb-printhead {
          opacity: 0;
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
        /* Rows "type" in left to right, like a thermal printer. */
        .rb-row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          height: 28px;
          font-size: 13px;
          color: #5a5f7a;
          clip-path: inset(0 100% 0 0);
          transition: clip-path 0ms 200ms;
        }
        .rb-row.is-printed {
          clip-path: inset(0 0 0 0);
          transition: clip-path 650ms steps(16, end);
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
          color: #303568;
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
        .rb-strong {
          font-weight: 800;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #303568;
        }
        .rb-strong .rb-mono {
          font-weight: 600;
          font-size: 16px;
          color: #27be7b;
        }
        .rb-rule {
          border-top: 1px dashed #d9d6cc;
          margin: 8px 0;
        }
        .rb-foot {
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
        @media (max-width: 640px) {
          .rb-group {
            padding: 8px 18px;
          }
          .rb-row {
            font-size: 12px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rb-row,
          .rb-row.is-printed,
          .rb-head,
          .rb-rule,
          .rb-foot {
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
