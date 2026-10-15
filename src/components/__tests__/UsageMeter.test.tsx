import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UsageMeter } from "@/components/UsageMeter";
import { getPlan } from "@/lib/plans";

afterEach(() => cleanup());

const base = {
  extra: 0,
  overageBilled: true,
  periodEnd: "2026-11-03T08:00:00Z",
  suggestion: null,
};

describe("UsageMeter", () => {
  it("shows usage against the plan with a progress bar", () => {
    render(<UsageMeter {...base} used={12} plan={getPlan("light")} />);

    expect(screen.getByText("12 of 15 receipts")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByText(/Resets 3 November/)).toBeInTheDocument();
  });

  it("states the extra charge once over the allowance", () => {
    render(<UsageMeter {...base} used={18} extra={3} plan={getPlan("light")} />);

    expect(screen.getByText("€1.20")).toBeInTheDocument();
    expect(screen.getByText(/on your next invoice/)).toBeInTheDocument();
  });

  it("explains there is no limit during the pilot", () => {
    render(<UsageMeter {...base} used={40} plan={null} />);

    expect(screen.getByText("40 receipts this month")).toBeInTheDocument();
    expect(screen.getByText(/No plan limit during the free pilot/)).toBeInTheDocument();
  });

  it("shows a cheaper-plan suggestion when there is one", () => {
    render(
      <UsageMeter
        {...base}
        used={45}
        extra={30}
        plan={getPlan("light")}
        suggestion={{ planName: "Regular", used: 45, better: 14.99, current: 17.99 }}
      />
    );

    expect(screen.getByText(/Regular would cost/)).toBeInTheDocument();
    // Amounts render in Geist Mono (DESIGN.md).
    expect(screen.getByText("€14.99")).toHaveClass("font-mono");
    expect(screen.getByText("€17.99")).toHaveClass("font-mono");
  });
});
