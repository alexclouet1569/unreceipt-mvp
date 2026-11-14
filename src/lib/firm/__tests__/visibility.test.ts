import { describe, expect, it } from "vitest";
import { FIRM_VISIBLE_FILTER, firmVisible, isFirmVisible } from "../visibility";

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
    expect(calls).toEqual([FIRM_VISIBLE_FILTER]);
  });
});
