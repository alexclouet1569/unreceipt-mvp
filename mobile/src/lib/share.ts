// Keeping unchanged data the same object across refreshes (pure, tested).
// The list's rows are memoised by their receipt object: a refresh that
// brings back the same receipts must hand back the same objects, or every
// row, the totals and the chips render again for nothing.

import type { MobileHome, MobileReceipt } from "@/lib/mobile/types";

/** `next`, reusing `prev` and its receipts wherever they didn't change. */
export function shareHome(prev: MobileHome | null, next: MobileHome): MobileHome {
  if (!prev) return next;
  if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
  if (prev.state !== "ready" || next.state !== "ready") return next;
  return { ...next, receipts: shareReceipts(prev.receipts, next.receipts) };
}

/** `next`, with each receipt equal to one in `prev` replaced by that object. */
export function shareReceipts(prev: MobileReceipt[], next: MobileReceipt[]): MobileReceipt[] {
  const byId = new Map(prev.map((r) => [r.id, r]));
  let changed = prev.length !== next.length;
  const out = next.map((r, i) => {
    const old = byId.get(r.id);
    const kept = old && JSON.stringify(old) === JSON.stringify(r) ? old : r;
    if (kept !== prev[i]) changed = true;
    return kept;
  });
  return changed ? out : prev;
}

/** What Insights reads from a receipt: a change here asks the server again. */
export function receiptsSignature(lists: (MobileReceipt[] | null | undefined)[]): string {
  return lists
    .flatMap((l) => l ?? [])
    .map((r) => [r.id, r.status, r.total, r.currency, r.homeTotal, r.date, r.category, r.merchant].join("|"))
    .join("\n");
}
