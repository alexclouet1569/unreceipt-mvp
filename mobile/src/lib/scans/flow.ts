// The scan flow's rules, pure (no React Native), so they are tested.
//
// A tap on the scan button opens Apple's document scanner. What it took is
// shown big first (review: Retake, or Use), and nothing is sent before Use.
// Then the receipt is read on a full screen with a scan line over it, and
// the digital receipt opens once the server has saved it. Apple's scanner
// can't be told to stop after one page, so a second shot of the same
// receipt is caught here, in the review, before it becomes a receipt.

import { scanMessage, type PendingScan, type ScanMessage } from "./queue";

/** A scan taken but not yet sent: a file on the phone, outside the queue. */
export type DraftScan = { id: string; fileUri: string };

export type ScanFlow =
  | { phase: "review"; drafts: DraftScan[] }
  | { phase: "reading"; ids: string[]; images: string[] };

/** What the reading screen shows for the scans it follows. */
export type ReadingView =
  /** Still being read. `done` of `total` (several scans at once). */
  | { kind: "reading"; done: number; total: number }
  /** Waiting for another try: the queue's own sentence, and the user may leave. */
  | { kind: "slow"; message: ScanMessage }
  /** One scan, saved: open its receipt. */
  | { kind: "open"; receiptId: string }
  /** Every scan has its answer (several at once, or one the user removed). */
  | { kind: "done" }
  /** One scan that needs the user: not a receipt, refused, or its picture lost. */
  | { kind: "stuck"; scanId: string; reason: "notReceipt" | "failed" | "missing" };

const STUCK = new Set<PendingScan["state"]>(["notReceipt", "failed", "missing"]);

/** A scan waiting for another try after a failed one (not the first send). */
function isSlow(p: PendingScan): boolean {
  return p.state === "waiting" && p.attempts > 0;
}

/**
 * The reading screen for `ids`: `pending` is the queue, `saved` maps a
 * scan's id to the receipt the server saved for it.
 */
export function readingView(ids: string[], pending: PendingScan[], saved: Record<string, string>): ReadingView {
  const byId = new Map(pending.map((p) => [p.id, p]));
  if (ids.length === 1) {
    const id = ids[0];
    const receiptId = saved[id];
    if (receiptId) return { kind: "open", receiptId };
    const p = byId.get(id);
    if (!p) return { kind: "done" };
    if (STUCK.has(p.state)) return { kind: "stuck", scanId: id, reason: p.state as "notReceipt" | "failed" | "missing" };
    if (isSlow(p)) return { kind: "slow", message: scanMessage(p) };
    return { kind: "reading", done: 0, total: 1 };
  }
  // Several: the list shows each one's answer, so this screen only counts.
  const open = ids.map((id) => byId.get(id)).filter((p): p is PendingScan => p != null && !STUCK.has(p.state));
  if (open.length === 0) return { kind: "done" };
  // Only "slow" when nothing is being read right now.
  if (!open.some((p) => p.state === "uploading") && open.some(isSlow)) {
    return { kind: "slow", message: scanMessage(open.find(isSlow)!) };
  }
  return { kind: "reading", done: ids.length - open.length, total: ids.length };
}

/** The drafts left after removing one in the review; null when none is left. */
export function withoutDraft(drafts: DraftScan[], id: string): DraftScan[] | null {
  const left = drafts.filter((d) => d.id !== id);
  return left.length > 0 ? left : null;
}
