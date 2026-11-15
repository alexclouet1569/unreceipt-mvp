import { describe, expect, it } from "vitest";
import { FIRM_APPROVED_FILTER, FIRM_VISIBLE_FILTER, firmVisible, isFirmVisible } from "../visibility";

describe("firm visibility", () => {
  it("hides only mailbox receipts the owner hasn't confirmed", () => {
    expect(isFirmVisible({ intake_channel: "mailbox", status: "pending_review" })).toBe(false);
    expect(isFirmVisible({ intake_channel: "mailbox", status: "verified" })).toBe(true);
    expect(isFirmVisible({ intake_channel: "forwarding", status: "pending_review" })).toBe(true);
    expect(isFirmVisible({ intake_channel: null, status: "pending_review" })).toBe(true);
    // Rows read before the column existed.
    expect(isFirmVisible({ status: "pending_review" })).toBe(true);
  });

  it("says the same as a PostgREST filter, NULL included", () => {
    expect(FIRM_VISIBLE_FILTER).toBe("intake_channel.is.null,intake_channel.neq.mailbox,status.eq.verified");
    const calls: string[] = [];
    const query = { or: (f: string) => (calls.push(f), query) };
    expect(firmVisible(query)).toBe(query);
    expect(FIRM_APPROVED_FILTER).toBe("approval_status.is.null,approval_status.eq.approved");
    expect(calls).toEqual([FIRM_VISIBLE_FILTER, FIRM_APPROVED_FILTER]);
  });

  it("shows an employee's receipt only once approved (2026-11-15)", () => {
    for (const s of ["draft", "submitted", "sent_back", "rejected"] as const) {
      expect(isFirmVisible({ intake_channel: null, status: "verified", approval_status: s })).toBe(false);
    }
    expect(isFirmVisible({ intake_channel: null, status: "verified", approval_status: "approved" })).toBe(true);
    // An approved mailbox receipt was confirmed by its owner on the way.
    expect(isFirmVisible({ intake_channel: "mailbox", status: "verified", approval_status: "approved" })).toBe(true);
    // An owner's receipt has no approval.
    expect(isFirmVisible({ intake_channel: null, status: "pending_review", approval_status: null })).toBe(true);
  });
});
