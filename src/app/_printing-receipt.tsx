"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * Landing-page scroll companion: a thermal receipt that prints one line
 * per section as the visitor scrolls, and feeds back in when they scroll
 * up. The printer sits at the bottom of the viewport so the paper rises
 * out of the slot — read top-to-bottom, the receipt is in print order,
 * exactly like the paper coming out of a till printer.
 *
 * Each line is tied to a section id; a line is "printed" once that
 * section's top crosses 65% of the viewport height. Lines with no
 * anchor are printed on load.
 */

export type ReceiptLine = {
  /** Section id that triggers the line. Omit to print on load. */
  anchor?: string;
  label: string;
  value: string;
};

type PrintingReceiptProps = {
  lines: ReceiptLine[];
  total: { anchor: string; label: string; value: string };
};

const TRIGGER = 0.65;

function isReached(anchor: string | undefined): boolean {
  if (!anchor) return true;
  const el = document.getElementById(anchor);
  if (!el) return false;
  return el.getBoundingClientRect().top < window.innerHeight * TRIGGER;
}

export function PrintingReceipt({ lines, total }: PrintingReceiptProps) {
  const [printed, setPrinted] = useState(0);
  const [totalPrinted, setTotalPrinted] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Lines print in order: stop at the first section not yet reached so
      // a deep-link to #pricing still prints everything above it.
      let count = 0;
      while (count < lines.length && isReached(lines[count].anchor)) count++;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      setPrinted(atBottom ? lines.length : count);
      setTotalPrinted(atBottom || isReached(total.anchor));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [lines, total.anchor]);

  return (
    <div className="printing-receipt" aria-hidden="true">
      {/* Paper: grows upward out of the printer slot. The height is driven
          by a CSS variable so the feed animates on every new line. */}
      <div
        className="pr-paper"
        style={
          {
            "--pr-lines": printed,
            "--pr-total": totalPrinted ? 1 : 0,
          } as React.CSSProperties
        }
      >
        <div className="pr-content">
          <div className="pr-head">
            <Wordmark variant="horizontal" className="text-[15px]" />
            <p className="pr-meta">unreceipt.com · Stockholm</p>
            <p className="pr-meta pr-mono">KVITTO #0042</p>
          </div>
          <div className="pr-rule" />
          <ul className="pr-lines">
            {lines.map((line, i) => (
              <li
                key={line.label}
                className={`pr-line ${i < printed ? "is-printed" : ""}`}
              >
                <span className="pr-label">{line.label}</span>
                <span className="pr-value pr-mono">{line.value}</span>
              </li>
            ))}
          </ul>
          <div className={`pr-total-block ${totalPrinted ? "is-printed" : ""}`}>
            <div className="pr-rule" />
            <div className="pr-total">
              <span>{total.label}</span>
              <span className="pr-mono">{total.value}</span>
            </div>
            <p className="pr-thanks">Tack! Paper is past.</p>
            <div className="pr-barcode" />
          </div>
        </div>
      </div>

      {/* Printer housing */}
      <div className="pr-printer">
        <span className="pr-slot" />
        <span className={`pr-led ${printed > 0 ? "is-on" : ""}`} />
      </div>

      <style jsx>{`
        .printing-receipt {
          --pr-w: 248px;
          --pr-scale: 1;
          --pr-head-h: 104px;
          --pr-line-h: 30px;
          --pr-total-h: 116px;
          --pr-printer-h: 44px;
          position: fixed;
          right: 24px;
          bottom: 0;
          width: var(--pr-w);
          z-index: 40;
          pointer-events: none;
          transform: scale(var(--pr-scale));
          transform-origin: bottom right;
        }
        /* Phones and tablets: same receipt, scaled down and pinned closer
           to the edge so it covers as little content as possible. */
        @media (max-width: 1023px) {
          .printing-receipt {
            --pr-scale: 0.62;
            right: 8px;
          }
        }
        .pr-paper {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: calc(var(--pr-printer-h) - 10px);
          height: calc(
            var(--pr-head-h) + var(--pr-lines) * var(--pr-line-h) +
              var(--pr-total) * var(--pr-total-h) + 14px
          );
          overflow: hidden;
          background: #fffefb;
          border: 1px solid #e8e5dd;
          border-bottom: 0;
          /* Torn top edge: a row of 12×6 teeth, then solid paper. */
          -webkit-mask:
            conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 0 0 / 12px 6px repeat-x,
            linear-gradient(#000 0 0) 0 6px / 100% 100% no-repeat;
          mask:
            conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 0 0 / 12px 6px repeat-x,
            linear-gradient(#000 0 0) 0 6px / 100% 100% no-repeat;
          transition: height 520ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pr-content {
          padding: 16px 16px 0;
          color: #303568;
        }
        .pr-head {
          height: calc(var(--pr-head-h) - 16px - 13px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          text-align: center;
        }
        .pr-meta {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #9ca0b8;
          font-weight: 600;
        }
        .pr-mono {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
        }
        .pr-rule {
          border-top: 1px dashed #c9c6bd;
          margin: 6px 0;
        }
        .pr-lines {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .pr-line {
          height: var(--pr-line-h);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 12.5px;
          opacity: 0;
          clip-path: inset(0 100% 0 0);
          transition: opacity 200ms ease, clip-path 0ms 200ms;
        }
        .pr-line.is-printed {
          opacity: 1;
          clip-path: inset(0 0 0 0);
          transition: clip-path 600ms steps(14, end) 260ms, opacity 0ms 260ms;
        }
        .pr-label {
          font-weight: 600;
          color: #5a5f7a;
          white-space: nowrap;
        }
        .pr-value {
          font-weight: 500;
          color: #303568;
          white-space: nowrap;
        }
        .pr-total-block {
          opacity: 0;
          transition: opacity 200ms ease;
        }
        .pr-total-block.is-printed {
          opacity: 1;
          transition: opacity 300ms ease 300ms;
        }
        .pr-total {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-weight: 800;
          font-size: 15px;
          padding-top: 4px;
        }
        .pr-total .pr-mono {
          font-weight: 600;
          color: #27be7b;
          font-size: 18px;
        }
        .pr-thanks {
          text-align: center;
          font-family: var(--font-accent), sans-serif;
          font-style: italic;
          font-size: 12px;
          color: #5a5f7a;
          margin: 10px 0 8px;
        }
        .pr-barcode {
          height: 28px;
          margin: 0 10px;
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
        .pr-printer {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: var(--pr-printer-h);
          background: #303568;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-bottom: 0;
          border-radius: 14px 14px 0 0;
        }
        .pr-slot {
          position: absolute;
          left: 8px;
          right: 8px;
          top: 8px;
          height: 4px;
          border-radius: 2px;
          background: #1c1f45;
        }
        .pr-led {
          position: absolute;
          right: 16px;
          bottom: 14px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #5a5f7a;
          transition: background 300ms ease;
        }
        .pr-led.is-on {
          background: #27be7b;
        }
        @media (prefers-reduced-motion: reduce) {
          .pr-paper,
          .pr-line,
          .pr-line.is-printed,
          .pr-total-block,
          .pr-total-block.is-printed {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
