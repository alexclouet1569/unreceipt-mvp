import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/reconcile/match";
import { DEMO_CLIENTS } from "../_fixtures";

// The demo is shown to accounting firms; these lock the story it tells, so
// a change to the matching rules can't quietly turn it into nonsense.

const summaries = (withReplies: boolean) =>
  Object.fromEntries(
    DEMO_CLIENTS.map((c) => {
      const receipts = withReplies ? [...c.receipts, ...c.replies] : c.receipts;
      const { summary, unmatchedReceiptIds } = reconcile(c.statement, receipts);
      return [c.id, { ...summary, unmatchedReceipts: unmatchedReceiptIds.length }];
    }),
  );

describe("demo fixtures", () => {
  it("start with receipts missing at most clients", () => {
    expect(summaries(false)).toEqual({
      kafe: { needReceipt: 9, matched: 5, check: 1, missing: 3, noReceipt: 3, moneyIn: 1, unmatchedReceipts: 0 },
      bygg: { needReceipt: 9, matched: 3, check: 0, missing: 6, noReceipt: 1, moneyIn: 1, unmatchedReceipts: 0 },
      studio: { needReceipt: 8, matched: 5, check: 2, missing: 1, noReceipt: 1, moneyIn: 1, unmatchedReceipts: 0 },
      fotvard: { needReceipt: 4, matched: 4, check: 0, missing: 0, noReceipt: 1, moneyIn: 1, unmatchedReceipts: 0 },
      it: { needReceipt: 6, matched: 3, check: 0, missing: 3, noReceipt: 0, moneyIn: 1, unmatchedReceipts: 1 },
    });
  });

  it("leave one honest gap after the clients reply", () => {
    const after = summaries(true);
    expect(after.kafe.missing).toBe(1);
    expect(after.bygg.missing).toBe(1);
    expect(after.studio.missing).toBe(0);
    expect(after.it.missing).toBe(0);
  });

  it("has a client reply only where receipts are missing", () => {
    for (const c of DEMO_CLIENTS) {
      const { summary } = reconcile(c.statement, c.receipts);
      expect(c.replies.length > 0).toBe(summary.missing > 0);
    }
  });
});
