import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Wordmark } from "../Wordmark";

afterEach(cleanup);

describe("Wordmark", () => {
  it("renders 'Un' inside a mono pill butted against 'Receipt'", () => {
    render(<Wordmark />);
    const outer = screen.getByTestId("wordmark");
    const un = screen.getByTestId("wordmark-un");
    expect(outer.textContent).toBe("UnReceipt");
    expect(un.textContent).toBe("Un");
    expect(un.className).toContain("font-mono");
    expect(outer.className).toContain("font-display");
  });

  it("merges custom className without dropping the display font", () => {
    render(<Wordmark className="text-2xl" />);
    const outer = screen.getByTestId("wordmark");
    expect(outer.className).toContain("text-2xl");
    expect(outer.className).toContain("font-display");
  });
});
