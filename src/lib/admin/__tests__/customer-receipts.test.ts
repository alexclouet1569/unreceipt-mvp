import { describe, expect, it } from "vitest";
import { splitForAdmin } from "../customer-receipts";

describe("splitForAdmin", () => {
  it("shows forwarded and other receipts, and only counts mailbox ones", () => {
    const rows = [
      { id: "a", intake_channel: "forwarding" as const },
      { id: "b", intake_channel: "mailbox" as const },
      { id: "c", intake_channel: null },
      { id: "d" },
      { id: "e", intake_channel: "mailbox" as const },
    ];
    const { shown, mailboxCount } = splitForAdmin(rows);
    expect(shown.map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(mailboxCount).toBe(2);
  });
});
