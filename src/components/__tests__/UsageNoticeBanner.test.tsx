import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UsageNoticeBanner } from "@/components/UsageNoticeBanner";

afterEach(() => cleanup());

describe("UsageNoticeBanner", () => {
  it("links the whole row to settings and renders amounts in mono", () => {
    render(
      <UsageNoticeBanner
        notice={{
          level: "over",
          planName: "Light",
          extra: 3,
          allowance: 15,
          overagePrice: 0.4,
          extraCost: 1.2,
        }}
      />
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/settings");
    expect(screen.getByText("€1.20")).toHaveClass("font-mono");
    expect(screen.getByText("€0.40")).toHaveClass("font-mono");
  });

  it("leaves out every price inside the store apps", () => {
    const { container } = render(
      <UsageNoticeBanner
        hidePrices
        notice={{
          level: "over",
          planName: "Light",
          extra: 3,
          allowance: 15,
          overagePrice: 0.4,
          extraCost: 1.2,
        }}
      />
    );
    expect(container.textContent).toMatch(/3 receipts over your Light plan/);
    expect(container.textContent).toMatch(/Everything is still saved/);
    expect(container.textContent).not.toMatch(/€/);

    cleanup();
    const warn = render(
      <UsageNoticeBanner
        hidePrices
        notice={{ level: "warn", planName: "Light", used: 13, allowance: 15, overagePrice: 0.4 }}
      />
    );
    expect(warn.container.textContent).toMatch(/13 of the 15 receipts/);
    expect(warn.container.textContent).not.toMatch(/€/);
  });
});
