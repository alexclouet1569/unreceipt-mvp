import { describe, expect, it } from "vitest";
import { readingView, withoutDraft } from "../scans/flow";
import type { PendingScan } from "../scans/queue";

const scan = (id: string, over: Partial<PendingScan> = {}): PendingScan => ({
  id,
  fileUri: `file:///docs/pending-scans/${id}.jpg`,
  createdAt: "2026-11-15T10:00:00Z",
  state: "uploading",
  attempts: 1,
  retryAt: 0,
  ...over,
});

describe("reading one scan", () => {
  it("reads, then opens the receipt the server saved", () => {
    expect(readingView(["a"], [scan("a")], {})).toEqual({ kind: "reading", done: 0, total: 1 });
    expect(readingView(["a"], [], { a: "r1" })).toEqual({ kind: "open", receiptId: "r1" });
  });

  it("a first send that hasn't started yet is still reading, not slow", () => {
    expect(readingView(["a"], [scan("a", { state: "waiting", attempts: 0 })], {}).kind).toBe("reading");
  });

  it("says why it waits after a failed try, in the queue's own words", () => {
    const v = readingView(["a"], [scan("a", { state: "waiting", attempts: 1, problem: "offline" })], {});
    expect(v).toEqual({ kind: "slow", message: "waiting" });
  });

  it("asks the user when it isn't a receipt, was refused, or its picture is gone", () => {
    for (const state of ["notReceipt", "failed", "missing"] as const) {
      expect(readingView(["a"], [scan("a", { state })], {})).toEqual({ kind: "stuck", scanId: "a", reason: state });
    }
  });

  it("is done when the scan was removed", () => {
    expect(readingView(["a"], [], {})).toEqual({ kind: "done" });
  });
});

describe("reading several scans", () => {
  it("counts what is finished and is done when every scan has its answer", () => {
    expect(readingView(["a", "b"], [scan("b")], { a: "r1" })).toEqual({ kind: "reading", done: 1, total: 2 });
    // A scan that isn't a receipt waits in the list, not here.
    expect(readingView(["a", "b"], [scan("b", { state: "notReceipt" })], { a: "r1" })).toEqual({ kind: "done" });
  });

  it("is slow only when nothing is being read", () => {
    const slow = scan("b", { state: "waiting", attempts: 2, problem: "timeout" });
    expect(readingView(["a", "b"], [scan("a"), slow], {}).kind).toBe("reading");
    expect(readingView(["a", "b"], [slow], { a: "r1" })).toEqual({ kind: "slow", message: "timeout" });
  });
});

describe("review", () => {
  it("removes one shot, and closes when none is left", () => {
    const drafts = [
      { id: "a", fileUri: "a.jpg" },
      { id: "b", fileUri: "b.jpg" },
    ];
    expect(withoutDraft(drafts, "a")).toEqual([{ id: "b", fileUri: "b.jpg" }]);
    expect(withoutDraft([drafts[0]], "a")).toBeNull();
  });
});
