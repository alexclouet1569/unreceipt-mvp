import { describe, expect, it } from "vitest";
import type { MobileApproval } from "@/lib/mobile/types";
import { approvalRowLabel, approvalView } from "../approval";

const r = (approval: Partial<MobileApproval> | null, missing: string[] = []) => ({
  approval: approval ? ({ status: "draft", comment: null, paidBy: null, reimbursed: false, ...approval } as MobileApproval) : null,
  missing: missing as never,
});

describe("approval in the app", () => {
  it("shows nothing for a receipt without approval (an owner's)", () => {
    expect(approvalView(r(null))).toMatchObject({ band: null, canSend: false, mayEdit: true, mayDelete: true });
    expect(approvalRowLabel(r(null))).toBeNull();
  });

  it("offers Send only when complete, as a draft or after it was sent back", () => {
    expect(approvalView(r({ status: "draft" })).canSend).toBe(true);
    expect(approvalView(r({ status: "draft" }, ["total"])).canSend).toBe(false);
    expect(approvalView(r({ status: "sent_back", comment: "Add the guests" }))).toMatchObject({
      band: "sentBack",
      comment: "Add the guests",
      canSend: true,
      attention: true,
    });
    expect(approvalView(r({ status: "submitted" })).canSend).toBe(false);
  });

  it("can't be deleted while waiting or once approved; a rejection can't be edited", () => {
    expect(approvalView(r({ status: "submitted" }))).toMatchObject({ mayDelete: false, mayEdit: true });
    expect(approvalView(r({ status: "approved" }))).toMatchObject({ mayDelete: false });
    expect(approvalView(r({ status: "rejected", comment: "Private" }))).toMatchObject({ mayEdit: false, mayDelete: true, comment: "Private" });
  });

  it("says whether an approved outlay was paid back", () => {
    expect(approvalView(r({ status: "approved", paidBy: "employee" })).band).toBe("approvedOwed");
    expect(approvalView(r({ status: "approved", paidBy: "employee", reimbursed: true })).band).toBe("approvedPaid");
    expect(approvalView(r({ status: "approved", paidBy: "company" })).band).toBe("approved");
  });

  it("labels the list row", () => {
    expect(approvalRowLabel(r({ status: "draft" }))).toBe("toSend");
    expect(approvalRowLabel(r({ status: "submitted" }))).toBe("sent");
    expect(approvalRowLabel(r({ status: "rejected" }))).toBe("rejected");
  });
});
