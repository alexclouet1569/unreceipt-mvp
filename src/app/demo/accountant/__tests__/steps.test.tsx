import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/demo/accountant", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ACCOUNTANT_STEPS } from "../_accountant-tour";
import { ACCOUNTANT_STEP_COUNT } from "../steps";
import AccountantTourPage from "../page";

describe("accountant demo tour", () => {
  it("the page knows every step of the tour", () => {
    expect(ACCOUNTANT_STEP_COUNT).toBe(ACCOUNTANT_STEPS.length);
  });

  it("reaches the last step (it was capped one short: Next on step 4 stayed on step 4)", async () => {
    const page = await AccountantTourPage({ searchParams: Promise.resolve({ step: "5" }) });
    expect(page.props.step).toBe(5);
    const capped = await AccountantTourPage({ searchParams: Promise.resolve({ step: "99" }) });
    expect(capped.props.step).toBe(ACCOUNTANT_STEP_COUNT);
  });
});
