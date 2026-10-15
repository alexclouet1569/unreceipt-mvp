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
});
