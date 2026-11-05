"use client";

import { useMemo, useState } from "react";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import { FilterChip } from "@/components/receipt/FilterChip";
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
  // The id, not a copy: after a save (booked, completed) the dialog shows
  // the refreshed row from props instead of the one it was opened with.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (receipts.find((r) => r.id === openId) ?? null) : null;

  const counts = useMemo(() => {
    const c = { all: receipts.length, review: 0, ready: 0, exported: 0 };
    for (const r of receipts) c[bucketOf(r)] += 1;
    return c;
  }, [receipts]);

  const shown = filter === "all" ? receipts : receipts.filter((r) => bucketOf(r) === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Filter receipts">
        {FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            active={filter === f.key}
            onClick={() => setFilter(f.key)}
            label={f.label}
            count={counts[f.key]}
            attention={f.key === "review"}
          />
        ))}
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
            <ReceiptListItem key={r.id} receipt={r} onClick={() => setOpenId(r.id)} />
          ))}
        </div>
      )}

      <ReceiptDetailDialog
        receipt={open}
        variant="firm"
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(null);
        }}
      />
    </div>
  );
}
