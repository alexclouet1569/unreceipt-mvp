import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntakeRow } from "@/components/IntakeRow";

afterEach(() => {
  cleanup();
});

describe("IntakeRow", () => {
  it("shows the address and copies it to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <IntakeRow
        callout="Forward email receipts to"
        value="receipts+abc123@in.unreceipt.com"
        mono
        copyLabel="Copy forwarding address"
      />
    );

    expect(screen.getByText("receipts+abc123@in.unreceipt.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy forwarding address" }));

    expect(writeText).toHaveBeenCalledWith("receipts+abc123@in.unreceipt.com");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
