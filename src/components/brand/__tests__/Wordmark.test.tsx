import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Wordmark } from "../Wordmark";

afterEach(cleanup);

describe("Wordmark", () => {
  it("defaults to the horizontal variant with icon + wordmark", () => {
    render(<Wordmark />);
    const outer = screen.getByTestId("wordmark");
    expect(outer.dataset.variant).toBe("horizontal");
    expect(outer.textContent).toBe("UnReceipt");
    // Isotype renders as SVG inside the lockup.
    expect(outer.querySelector("svg")).not.toBeNull();
  });

  it("renders 'Un' in Deep Space and 'Receipt' in Green Mint on light surface", () => {
    render(<Wordmark variant="wordmark" />);
    const outer = screen.getByTestId("wordmark");
    const spans = outer.querySelectorAll("span > span");
    // First inner span = "Un" (Deep Space), second = "Receipt" (Green Mint).
    const un = Array.from(spans).find((s) => s.textContent === "Un");
    const receipt = Array.from(spans).find((s) => s.textContent === "Receipt");
    expect(un).toBeDefined();
    expect(receipt).toBeDefined();
    expect((un as HTMLElement).style.color).toBe("rgb(48, 53, 104)");
    expect((receipt as HTMLElement).style.color).toBe("rgb(39, 190, 123)");
  });

  it("renders icon-only variant with no text", () => {
    render(<Wordmark variant="icon" />);
    const outer = screen.getByTestId("wordmark");
    expect(outer.dataset.variant).toBe("icon");
    expect(outer.textContent).toBe("");
    expect(outer.querySelector("svg")).not.toBeNull();
  });

  it("renders stacked variant with icon above text", () => {
    render(<Wordmark variant="stacked" />);
    const outer = screen.getByTestId("wordmark");
    expect(outer.dataset.variant).toBe("stacked");
    expect(outer.textContent).toBe("UnReceipt");
    expect(outer.className).toContain("flex-col");
  });

  it("uses single-color wordmark on dark surface", () => {
    render(<Wordmark variant="wordmark" on="dark" />);
    const outer = screen.getByTestId("wordmark");
    const spans = outer.querySelectorAll("span > span");
    const un = Array.from(spans).find((s) => s.textContent === "Un");
    const receipt = Array.from(spans).find((s) => s.textContent === "Receipt");
    // Both letters render in the same surface color (cream / white) on navy.
    expect((un as HTMLElement).style.color).toBe(
      (receipt as HTMLElement).style.color,
    );
  });

  it("uses single-color wordmark on mint surface", () => {
    render(<Wordmark variant="wordmark" on="mint" />);
    const outer = screen.getByTestId("wordmark");
    const spans = outer.querySelectorAll("span > span");
    const un = Array.from(spans).find((s) => s.textContent === "Un");
    const receipt = Array.from(spans).find((s) => s.textContent === "Receipt");
    // Both letters render in Deep Space navy on mint.
    expect((un as HTMLElement).style.color).toBe("rgb(48, 53, 104)");
    expect((receipt as HTMLElement).style.color).toBe("rgb(48, 53, 104)");
  });

  it("exposes an accessible name", () => {
    render(<Wordmark />);
    expect(screen.getByRole("img", { name: "UnReceipt" })).toBeDefined();
  });

  it("accepts a custom accessible name", () => {
    render(<Wordmark title="UnReceipt — home" />);
    expect(screen.getByRole("img", { name: "UnReceipt — home" })).toBeDefined();
  });

  it("merges custom className", () => {
    render(<Wordmark className="text-2xl" />);
    const outer = screen.getByTestId("wordmark");
    expect(outer.className).toContain("text-2xl");
  });
});
