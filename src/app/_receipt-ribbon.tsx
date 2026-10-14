"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Landing-page backdrop, variant B: a ribbon of receipt paper that comes
 * out of the hero and winds down the page behind the content. It
 * runs down the side gutters and only crosses the page in the empty
 * space between two sections, so it never sits behind text on desktop.
 *
 * Motion, all scroll-driven:
 *   - the ribbon is drawn down to a "print head" that rides 85% down
 *     the viewport (scrolling up rolls it back);
 *   - the receipt text feeds along the paper as you scroll.
 *
 * Geometry is measured from the real section positions, so the path
 * follows the page at any width. Decorative only (aria-hidden).
 */

// Sections whose top edge the ribbon crosses at.
const CROSSINGS = ["features", "how", "difference", "pricing", "about"];
const HEAD = 0.85;
// How fast the text feeds along the paper, per pixel scrolled.
const FEED = 0.35;

const TEXT =
  "UNRECEIPT · KVITTO #0042 · ICA MAXI 342,00 · SJ STOCKHOLM–GÖTEBORG 895,00 · " +
  "SPOTIFY 129,00 · SCANDIC HOTEL 1 250,00 · UBER 189,00 · APOTEKET 212,00 · " +
  "COOP KONFERENS 890,00 · PRESSBYRÅN 68,00 · SUMMA 3 975,00 · VARAV MOMS 795,00 · " +
  "LOST RECEIPTS 0 · TOTAL STRESS 0,00 · TACK! · ";

type Geometry = {
  w: number;
  h: number;
  d: string;
  strip: number;
  font: number;
};

function buildGeometry(wrapper: HTMLElement): Geometry {
  const w = wrapper.clientWidth;
  const h = wrapper.offsetHeight;
  const mobile = w < 640;
  const strip = mobile ? 22 : w < 1200 ? 34 : 46;
  // Center of the side gutter next to a max-w-5xl (1024px) content column.
  const gutter = w >= 1200 ? Math.max(48, (w - 1024) / 4) : mobile ? 10 : 22;
  const left = gutter;
  const right = w - gutter;
  const gap = 64;
  const ys = CROSSINGS.map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el && wrapper.contains(el))
    .map((el) => el.offsetTop);

  let x = right;
  // Comes out of the hero's bottom edge in the right gutter.
  let d = `M ${right} -12`;
  for (const y of ys) {
    const nx = x === right ? left : right;
    d += ` L ${x} ${y - gap} C ${x} ${y}, ${nx} ${y}, ${nx} ${y + gap}`;
    x = nx;
  }
  // Finish in the middle of the page, just above the waitlist.
  const end = h - 24;
  d += ` L ${x} ${end - 140} C ${x} ${end - 40}, ${w / 2} ${end - 90}, ${w / 2} ${end}`;
  return { w, h, d, strip, font: mobile ? 8 : w < 1200 ? 10 : 12 };
}

// Enough copies of the text to cover the path plus everything the feed
// pulls back (mono glyphs are ~0.66em wide with the letter-spacing).
function repeatsFor(g: Geometry): number {
  const patternPx = TEXT.length * g.font * 0.66;
  return Math.ceil((g.h * 1.5 + g.h * FEED) / patternPx) + 2;
}

export function ReceiptRibbon() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const maskRef = useRef<SVGPathElement>(null);
  const textRef = useRef<SVGTextPathElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);

  // Measure the page and lay the ribbon along it.
  useLayoutEffect(() => {
    const wrapper = svgRef.current?.parentElement;
    if (!wrapper) return;
    let last = "";
    const measure = () => {
      const g = buildGeometry(wrapper);
      const key = `${g.w}x${g.h}:${g.d}`;
      if (key !== last) {
        last = key;
        setGeo(g);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // Scroll: draw the ribbon down to the print head, feed the text.
  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    const mask = maskRef.current;
    const text = textRef.current;
    const head = headRef.current;
    if (!geo || !svg || !path || !mask || !text || !head) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = path.getTotalLength();
    // Length → y lookup. The path only ever moves down, so y is monotonic.
    const step = 16;
    const lut: { l: number; x: number; y: number }[] = [];
    for (let l = 0; l <= total; l += step) {
      const p = path.getPointAtLength(l);
      lut.push({ l, x: p.x, y: p.y });
    }
    mask.style.strokeDasharray = `${total} ${total}`;

    let frame = 0;
    const update = () => {
      frame = 0;
      const top = svg.getBoundingClientRect().top;
      const target = reduced ? Infinity : window.innerHeight * HEAD - top;
      let i = 0;
      let hi = lut.length - 1;
      if (target >= lut[hi].y) i = hi;
      else {
        while (i < hi) {
          const mid = (i + hi) >> 1;
          if (lut[mid].y < target) i = mid + 1;
          else hi = mid;
        }
      }
      const point = lut[i];
      const drawn = target <= 0 ? 0 : point.l;
      mask.style.strokeDashoffset = `${total - drawn}`;
      head.setAttribute("transform", `translate(${point.x} ${point.y})`);
      head.style.opacity = drawn > 0 && drawn < total - step ? "1" : "0";
      if (!reduced) {
        text.setAttribute("startOffset", `${-window.scrollY * FEED}`);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [geo]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible"
      width={geo?.w}
      height={geo?.h}
      viewBox={geo ? `0 0 ${geo.w} ${geo.h}` : undefined}
    >
      {geo && (
        <>
          <defs>
            <path id="receipt-ribbon-path" ref={pathRef} d={geo.d} fill="none" />
            <mask id="receipt-ribbon-mask" maskUnits="userSpaceOnUse">
              <path
                ref={maskRef}
                d={geo.d}
                fill="none"
                stroke="#fff"
                strokeWidth={geo.strip + 12}
              />
            </mask>
          </defs>
          <g mask="url(#receipt-ribbon-mask)">
            {/* Paper: hairline edge, white body, dashed tear line down the middle */}
            <use href="#receipt-ribbon-path" stroke="#E8E5DD" strokeWidth={geo.strip + 2} fill="none" />
            <use href="#receipt-ribbon-path" stroke="#FFFFFF" strokeWidth={geo.strip} fill="none" />
            <text
              fill="#303568"
              fillOpacity={0.5}
              fontSize={geo.font}
              dominantBaseline="central"
              style={{
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                letterSpacing: "0.06em",
              }}
            >
              <textPath ref={textRef} href="#receipt-ribbon-path" startOffset="0">
                {TEXT.repeat(repeatsFor(geo))}
              </textPath>
            </text>
          </g>
          {/* Print head: a small green light riding the tip of the paper */}
          <g ref={headRef} style={{ opacity: 0, transition: "opacity 300ms ease" }}>
            <circle r={geo.strip / 2 + 6} fill="#27BE7B" fillOpacity={0.12} />
            <circle r={4} fill="#27BE7B" />
          </g>
        </>
      )}
    </svg>
  );
}
