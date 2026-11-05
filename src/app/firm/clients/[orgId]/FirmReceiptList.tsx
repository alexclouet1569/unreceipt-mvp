"use client";

import { useMemo, useState } from "react";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import { ReceiptDetailDialog } from "@/app/app/(authed)/ReceiptDetailDialog";
import type { Receipt } from "@/lib/types";

type Filter = "all" | "review" | "ready" | "exported";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "review", label: "Review needed" },
  { key: "ready", label: "Ready" },
  { key: "exported", label: "Exported" },
];

export function bucketOf(r: Pick<Receipt, "status" | "exported_at">): Exclude<Filter, "all"> {
  if (r.status === "pending_review") return "review";
  return r.exported_at ? "exported" : "ready";
}

/**
 * A client's receipts for the month, with the inbox's chips and the shared
 * detail dialog in its firm variant (complete review, download PDF, see the
 * original; no delete, no re-run).
 */
export function FirmReceiptList({ receipts }: { receipts: Receipt[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Receipt | null>(null);

  const counts = useMemo(() => {
    const c = { all: receipts.length, review: 0, ready: 0, exported: 0 };
    for (const r of receipts) c[bucketOf(r)] += 1;
    return c;
  }, [receipts]);

  const shown = filter === "all" ? receipts : receipts.filter((r) => bucketOf(r) === filter);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Filter receipts" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const review = f.key === "review" && counts.review > 0;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 transition-colors " +
                (active
                  ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                  : "border-[var(--hairline)] bg-card text-[var(--ink-muted)] hover:text-[var(--ink)]")
              }
              style={{ height: "36px", fontSize: "13px", fontWeight: 600 }}
            >
              {f.label}
              <span
                className="font-mono tabular-nums"
                style={{
                  fontSize: "12px",
                  color: active ? "rgba(255,255,255,0.8)" : review ? "var(--attention-deep)" : undefined,
                }}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p
          className="rounded-[12px] border border-[var(--hairline)] bg-card px-4 py-8 text-center text-[var(--ink-muted)]"
          style={{ fontSize: "14px" }}
        >
          Nothing here for this month.
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <ReceiptListItem key={r.id} receipt={r} onClick={() => setOpen(r)} />
          ))}
        </div>
      )}

      <ReceiptDetailDialog
        receipt={open}
        variant="firm"
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpen(null);
        }}
      />
    </div>
  );
}
