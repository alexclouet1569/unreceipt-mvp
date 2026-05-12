import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptureFab } from "../CaptureFab";

afterEach(cleanup);

describe("CaptureFab", () => {
  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<CaptureFab onClick={onClick} />);
    await userEvent.click(screen.getByTestId("capture-fab"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders with accessible label and a + icon", () => {
    render(<CaptureFab onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: /capture receipt/i });
    expect(btn).toBeInTheDocument();
    expect(btn.querySelector("svg")).toBeTruthy();
  });
});
