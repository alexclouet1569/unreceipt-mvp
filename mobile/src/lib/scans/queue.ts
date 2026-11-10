// The scan queue's rules, pure (no React Native), so they are tested.
//
// A scan is saved on the phone first, then sent to POST /api/capture/scan,
// which reads it and creates the receipt ("To confirm", like every receipt
// nobody has checked yet). Nothing is lost offline: a scan waits on the
// phone and is sent again with a growing pause.

import type { MobileReceipt } from "@/lib/mobile/types";

export type ScanState =
  | "waiting" // on the phone, to be sent (now or after `retryAt`)
  | "uploading" // being read by the server
  | "notReceipt" // the server says it isn't a receipt; the user removes it
  | "failed"; // refused, or MAX_ATTEMPTS used up: "Try again" or remove

export type PendingScan = {
  id: string;
  /** The prepared JPEG in the app's documents folder. */
  fileUri: string;
  createdAt: string;
  state: ScanState;
  attempts: number;
  /** Epoch ms before which a waiting scan isn't retried. */
  retryAt: number;
};

/** How many scans are read at the same time (as the website's batch sheet). */
export const CONCURRENCY = 2;

/**
 * Tries before a scan waits for the user's "Try again" (about 10 minutes of
 * backoff). A resend is safe (the server recognises the scan's id), but it
 * shouldn't go on for ever on a line that never gets through.
 */
export const MAX_ATTEMPTS = 8;

/** 5 s, 10 s, 20 s … up to 5 minutes between tries. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);
}

/** The scans to send now, oldest first, leaving room for those in flight. */
export function dueScans(queue: PendingScan[], now: number): PendingScan[] {
  const busy = queue.filter((s) => s.state === "uploading").length;
  const room = Math.max(0, CONCURRENCY - busy);
  return queue
    .filter((s) => s.state === "waiting" && s.retryAt <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, room);
}

/** When the next waiting scan becomes due, or null. */
export function nextRetryAt(queue: PendingScan[]): number | null {
  const times = queue.filter((s) => s.state === "waiting").map((s) => s.retryAt);
  return times.length > 0 ? Math.min(...times) : null;
}

/** After a restart nothing is in flight any more. */
export function resumeQueue(queue: PendingScan[]): PendingScan[] {
  return queue.map((s) => (s.state === "uploading" ? { ...s, state: "waiting", retryAt: 0 } : s));
}

/** The body /api/capture/scan answers with when it saved a receipt. */
export type ScanSaved = {
  ok: true;
  id: string;
  merchant: string | null;
  total: number | null;
  currency: string;
  receiptDate: string | null;
  status: MobileReceipt["status"];
  duplicate?: boolean;
};

export type UploadOutcome =
  | { kind: "saved"; saved: ScanSaved }
  | { kind: "notReceipt" }
  | { kind: "retry" } // offline, rate-limited or a server error: try again later
  | { kind: "failed" }; // refused for good: trying again won't help

/** What a response from /api/capture/scan means for the queue. */
export function classifyUpload(status: number, body: unknown): UploadOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    if (b.skipped === true) return { kind: "notReceipt" };
    if (b.ok === true && typeof b.id === "string") return { kind: "saved", saved: b as unknown as ScanSaved };
    return { kind: "retry" };
  }
  // 408 timeout, 429 rate limit, 5xx: the scan is fine, the moment wasn't.
  if (status === 408 || status === 429 || status >= 500) return { kind: "retry" };
  return { kind: "failed" };
}

/**
 * The new receipt as a list row, right away, before the next refresh brings
 * the server's full version (category, conversions).
 */
export function receiptFromScan(saved: ScanSaved, now: Date = new Date()): MobileReceipt {
  const missing: MobileReceipt["missing"] = [];
  if (!saved.merchant) missing.push("merchant");
  if (saved.total == null) missing.push("total");
  if (!saved.receiptDate) missing.push("purchased_at");
  return {
    id: saved.id,
    status: saved.status,
    missing,
    source: "paper",
    merchant: saved.merchant,
    category: "other",
    currency: saved.currency,
    total: saved.total,
    homeCurrency: null,
    homeTotal: null,
    fxSource: null,
    date: saved.receiptDate,
    createdAt: now.toISOString(),
    original: "image",
    notes: null,
    possibleDuplicate: Boolean(saved.duplicate),
    exportedAt: null,
    bookedAt: null,
  };
}
