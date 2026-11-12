/**
 * Loading shapes for the product's pages (loading.tsx), laid out like the
 * page that is coming: `--skeleton` blocks breathing slowly (.skeleton in
 * globals.css, still under reduced motion), never a spinner on an empty
 * page (DESIGN.md "Layout"). Hidden from screen readers, which hear the
 * status line instead.
 */

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-[6px] ${className}`} />;
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[540px] px-4 py-6">
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </div>
  );
}

/** A receipt card's shape: merchant block, two lines, the amount. */
function CardShape() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 rounded-[12px] border border-[var(--hairline)] bg-card px-3.5 py-3">
      <div className="skeleton h-10 w-10 shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="skeleton h-3.5 w-2/5 rounded-[6px]" />
        <div className="skeleton h-3 w-1/4 rounded-[6px]" />
      </div>
      <div className="skeleton h-4 w-16 rounded-[6px]" />
    </div>
  );
}

export function ReceiptsSkeleton() {
  return (
    <Frame label="Loading your receipts">
      <Block className="h-7 w-44" />
      <Block className="mt-2 mb-6 h-3.5 w-52" />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" className="h-[62px] rounded-[12px] border border-[var(--hairline)] bg-card" />
        ))}
      </div>
      <Block className="mb-3 h-[54px] w-full rounded-[10px]" />
      <div className="mb-5 flex gap-2">
        {[64, 120, 88].map((w) => (
          <div key={w} aria-hidden="true" className="skeleton h-9 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <Block className="mb-2 h-3 w-20" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <CardShape key={i} />
        ))}
      </div>
    </Frame>
  );
}

/** Settings: a title, then section labels over hairline cards of rows. */
export function SettingsSkeleton() {
  return (
    <Frame label="Loading settings">
      <Block className="mb-8 h-7 w-32" />
      {[2, 1, 3].map((rows, i) => (
        <div key={i} className="mb-8">
          <Block className="mb-2 h-3 w-24" />
          <div aria-hidden="true" className="divide-y divide-[var(--hairline)] rounded-[12px] border border-[var(--hairline)] bg-card">
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex items-center justify-between px-3.5 py-4">
                <div className="skeleton h-3.5 w-2/5 rounded-[6px]" />
                <div className="skeleton h-3.5 w-12 rounded-[6px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Frame>
  );
}

/** The forwarding guide: the way back, the title, the address card, a step. */
export function GuideSkeleton() {
  return (
    <Frame label="Loading the setup guide">
      <Block className="mb-3 h-4 w-20" />
      <Block className="mb-6 h-7 w-56" />
      <div aria-hidden="true" className="mb-6 h-[58px] rounded-[12px] border border-[var(--hairline)] bg-card" />
      <Block className="mb-3 h-3 w-24" />
      <div aria-hidden="true" className="h-56 rounded-[12px] border border-[var(--hairline)] bg-card" />
    </Frame>
  );
}

/** Insights: the period switch, the hero and the chart's bars. */
export function InsightsSkeleton() {
  return (
    <Frame label="Loading your insights">
      <Block className="mb-4 h-7 w-32" />
      <Block className="h-[54px] w-full rounded-[10px]" />
      <Block className="mx-auto mt-5 mb-6 h-5 w-36" />
      <Block className="h-3 w-12" />
      <Block className="mt-2 h-10 w-52" />
      <Block className="mt-3 mb-8 h-7 w-40 rounded-full" />
      <div aria-hidden="true" className="flex h-[140px] items-end gap-2 border-b border-[var(--hairline)]">
        {[40, 72, 55, 96, 30, 64, 88, 48, 110, 60, 35, 78].map((h, i) => (
          <div key={i} className="skeleton flex-1 rounded-t-[3px]" style={{ height: h }} />
        ))}
      </div>
    </Frame>
  );
}

/** A list behind a number on Insights: the way back, a title, the cards. */
export function ListSkeleton() {
  return (
    <Frame label="Loading the receipts">
      <Block className="mb-3 h-4 w-20" />
      <Block className="h-7 w-44" />
      <Block className="mt-2 mb-6 h-3.5 w-28" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <CardShape key={i} />
        ))}
      </div>
    </Frame>
  );
}
