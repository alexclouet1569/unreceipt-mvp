"use client";

import { Mail, X } from "lucide-react";
import type { NewReceipts } from "./use-receipt-updates";

// "2 new receipts from your email · Review" at the top of /app. The list is
// sorted by each receipt's printed date, so one dated last week that
// arrives today lands mid-list (or beyond the newest 50) and is easy to
// miss: Review opens the newest one; the notice then counts the rest, so
// Review again walks through them. × counts them all as seen.
export function NewReceiptsNotice({
  notice,
  onOpen,
}: {
  notice: NewReceipts;
  onOpen: (id: string) => void;
}) {
  const count = notice.items.length;
  return (
    // Always in the DOM so screen readers announce a new count.
    <div aria-live="polite">
      {count > 0 ? (
        <div
          className="mb-4 flex items-center gap-3 rounded-[12px] border border-[var(--hairline)] bg-card py-1.5 pr-1.5 pl-3"
          data-testid="new-receipts-notice"
        >
          <Mail className="size-4 shrink-0 text-[var(--brand-action)]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[14px] font-semibold text-[var(--ink)]">
            {count === 1 ? "1 new receipt from your email" : `${count} new receipts from your email`}
          </p>
          <button
            type="button"
            onClick={() => onOpen(notice.items[0].id)}
            className="h-11 shrink-0 rounded-[10px] px-3 text-[14px] font-bold text-[var(--brand-action)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Review
          </button>
          <button
            type="button"
            onClick={notice.dismiss}
            aria-label="Hide the new receipts notice"
            className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--ink-muted)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
