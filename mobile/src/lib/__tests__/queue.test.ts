import { describe, expect, it } from "vitest";
import {
  classifyUpload,
  dueScans,
  isExpired,
  nextAttemptAt,
  retryAfterMs,
  nextRetryAt,
  receiptFromScan,
  resumeQueue,
  retryDelayMs,
  type PendingScan,
} from "../scans/queue";
import { loadMoreCursor } from "../sections";

const scan = (id: string, over: Partial<PendingScan> = {}): PendingScan => ({
  id,
  fileUri: `file:///docs/pending/${id}.jpg`,
  createdAt: `2026-11-10T10:00:0${id}Z`,
  state: "waiting",
  attempts: 0,
  retryAt: 0,
  ...over,
});

describe("scan queue", () => {
  it("sends two at a time, oldest first, and waits for a scan's retry time", () => {
    const now = 1_000;
    const q = [scan("3"), scan("1"), scan("2"), scan("4", { retryAt: 5_000 })];
    expect(dueScans(q, now).map((s) => s.id)).toEqual(["1", "2"]);
    expect(dueScans([scan("1", { state: "uploading" }), scan("2"), scan("3")], now).map((s) => s.id)).toEqual(["2"]);
    expect(dueScans([scan("1", { state: "uploading" }), scan("2", { state: "uploading" }), scan("3")], now)).toEqual([]);
    expect(dueScans([scan("1", { state: "notReceipt" }), scan("2", { state: "failed" })], now)).toEqual([]);
  });

  it("backs off 5 s, 10 s, 20 s … up to 5 minutes", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(retryDelayMs(20)).toBe(300_000);
  });

  it("knows when to wake up next, and resumes scans cut off by a restart", () => {
    expect(nextRetryAt([scan("1", { retryAt: 9 }), scan("2", { retryAt: 4 }), scan("3", { state: "failed", retryAt: 1 })])).toBe(4);
    expect(nextRetryAt([])).toBeNull();
    expect(resumeQueue([scan("1", { state: "uploading", retryAt: 50 })])[0]).toMatchObject({ state: "waiting", retryAt: 0 });
  });
});

describe("reading the server's answer", () => {
  const saved = { ok: true, id: "r1", merchant: "ICA", total: 245, currency: "SEK", receiptDate: "2026-11-09", status: "pending_review" };

  it("tells saved, not a receipt, try later and refused apart", () => {
    expect(classifyUpload(200, saved).kind).toBe("saved");
    expect(classifyUpload(200, { ok: true, skipped: true, reason: "This doesn't look like a receipt." })).toEqual({ kind: "notReceipt" });
    for (const status of [408, 429, 500, 502, 503]) expect(classifyUpload(status, { error: "x" }).kind).toBe("retry");
    for (const status of [400, 403, 413]) expect(classifyUpload(status, { error: "x" }).kind).toBe("failed");
    // A 200 that isn't the expected shape is retried, never dropped.
    expect(classifyUpload(200, null).kind).toBe("retry");
  });

  it("turns a fresh scan into a list row at once", () => {
    const row = receiptFromScan({ ...saved, status: "pending_review" } as never, new Date("2026-11-10T10:00:00Z"));
    expect(row).toMatchObject({ id: "r1", merchant: "ICA", total: 245, missing: [], status: "pending_review", source: "paper" });
    const empty = receiptFromScan({ ...saved, merchant: null, total: null, receiptDate: null } as never);
    expect(empty.missing).toEqual(["merchant", "total", "purchased_at"]);
  });
});

describe("server pauses and old scans", () => {
  it("reads Retry-After in seconds, capped at an hour", () => {
    expect(retryAfterMs("120")).toBe(120_000);
    expect(retryAfterMs("999999")).toBe(3_600_000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
  });

  it("waits for the longer of the backoff and the server's pause", () => {
    expect(nextAttemptAt(1, null, 1_000)).toBe(6_000);
    expect(nextAttemptAt(1, 3_600_000, 0)).toBe(3_600_000);
    expect(nextAttemptAt(8, 1_000, 0)).toBe(300_000);
  });

  it("drops scans older than 30 days", () => {
    const now = Date.parse("2026-11-11T12:00:00Z");
    expect(isExpired({ createdAt: "2026-10-01T12:00:00Z" }, now)).toBe(true);
    expect(isExpired({ createdAt: "2026-11-01T12:00:00Z" }, now)).toBe(false);
    expect(isExpired({ createdAt: "garbage" }, now)).toBe(false);
  });
});

describe("load more after a scan", () => {
  it("starts after the last row with a list key, skipping a just-scanned receipt", () => {
    const scanned = receiptFromScan({
      ok: true,
      id: "new",
      merchant: null,
      total: null,
      currency: "SEK",
      receiptDate: null,
      status: "pending_review",
    });
    expect(scanned.listKey).toBeUndefined();
    expect(loadMoreCursor([{ listKey: "a" }, { listKey: "b" }, scanned])).toBe("b");
    expect(loadMoreCursor([{ listKey: "a" }, { listKey: "b" }])).toBe("b");
    expect(loadMoreCursor([scanned, {}])).toBeNull();
    expect(loadMoreCursor([])).toBeNull();
  });
});
