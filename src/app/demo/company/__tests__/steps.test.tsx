import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/demo/company", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { COMPANY_STEPS } from "../_company-tour";
import { addToPayBack, DEMO_APPROVAL_QUEUE, DEMO_PAY_BACK } from "../_demo-team";
import { COMPANY_STEP_COUNT } from "../steps";
import CompanyTourPage from "../page";

describe("company demo tour", () => {
  it("the page knows every step of the tour", () => {
    expect(COMPANY_STEP_COUNT).toBe(COMPANY_STEPS.length);
  });

  it("reaches the last step and caps beyond it", async () => {
    const last = await CompanyTourPage({ searchParams: Promise.resolve({ step: String(COMPANY_STEP_COUNT) }) });
    expect(last.props.step).toBe(COMPANY_STEP_COUNT);
    const capped = await CompanyTourPage({ searchParams: Promise.resolve({ step: "99" }) });
    expect(capped.props.step).toBe(COMPANY_STEP_COUNT);
  });

  it("puts an approved own-money outlay in To pay back, and a company-paid one nowhere", () => {
    const own = DEMO_APPROVAL_QUEUE.find((i) => i.receipt.approval?.paidBy === "employee")!;
    const company = DEMO_APPROVAL_QUEUE.find((i) => i.receipt.approval?.paidBy === "company")!;
    const after = addToPayBack(DEMO_PAY_BACK, own);
    const line = after.find((g) => g.employee === own.employee)!;
    expect(line.receiptIds).toContain(own.receipt.id);
    expect(line.total).toBe(own.receipt.total);
    expect(addToPayBack(DEMO_PAY_BACK, company)).toEqual(DEMO_PAY_BACK);
  });

  it("adds to an employee's existing line instead of a second one", () => {
    const sara = { ...DEMO_APPROVAL_QUEUE[1], receipt: { ...DEMO_APPROVAL_QUEUE[1].receipt, approval: { status: "submitted" as const, comment: null, paidBy: "employee" as const, reimbursed: false } } };
    const after = addToPayBack(DEMO_PAY_BACK, sara);
    expect(after).toHaveLength(1);
    expect(after[0].count).toBe(2);
    expect(after[0].total).toBe(156 + sara.receipt.total!);
  });
});
