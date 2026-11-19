// The Analysis page's category donut (DESIGN.md "Charts and Analysis"):
// one ring, one fixed colour per category, 2 px gaps between slices, the
// period's total in the centre. No hooks, so the server page and the demo
// tour both render it. Hidden from screen readers: the category rows under
// it carry every number.

import { donutSegments } from "@/lib/analytics/display";

const SIZE = 168;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export type DonutSlice = { key: string; share: number; color: string };

export function Donut({ slices, centre, caption }: { slices: DonutSlice[]; centre: string; caption: string }) {
  const segs = donutSegments(
    slices.map((s) => s.share),
    C,
    2,
  );
  return (
    <div aria-hidden="true" className="relative mx-auto shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block -rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--hairline)" strokeWidth={STROKE} />
        {segs.map((seg, i) => (
          <circle
            key={slices[i].key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={slices[i].color}
            strokeWidth={STROKE}
            strokeDasharray={`${seg.length} ${C - seg.length}`}
            strokeDashoffset={-seg.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
        <span
          className={
            "font-mono font-medium tracking-[-0.02em] text-[var(--ink)] tabular-nums " +
            (centre.length > 11 ? "text-[14px]" : "text-[17px]")
          }
        >
          {centre}
        </span>
        <span className="mt-0.5 type-caption text-[var(--ink-muted)]">{caption}</span>
      </div>
    </div>
  );
}
