import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { SwipeToDelete } from "@/components/receipt/SwipeToDelete";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Row({ onDelete = vi.fn(), onOpen = vi.fn() }) {
  const [open, setOpen] = useState(false);
  return (
    <SwipeToDelete open={open} onOpenChange={setOpen} onDelete={onDelete} label="ICA, 245.00 kr">
      <button type="button" onClick={onOpen}>
        ICA
      </button>
    </SwipeToDelete>
  );
}

const swipe = (el: Element, dx: number, dy = 0, pointerType = "touch") => {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType, clientX: 300, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: 300 + dx / 2, clientY: 100 + dy / 2 });
  fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: 300 + dx, clientY: 100 + dy });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType, clientX: 300 + dx, clientY: 100 + dy });
};

const deleteButton = () =>
  document.querySelector('button[aria-label="Delete receipt: ICA, 245.00 kr"]') as HTMLButtonElement;

describe("SwipeToDelete", () => {
  it("reveals Delete on a left swipe, and deletes only when it's tapped", () => {
    const onDelete = vi.fn();
    render(<Row onDelete={onDelete} />);
    expect(deleteButton()).toBeNull();

    swipe(screen.getByTestId("swipe-row"), -120);
    expect(deleteButton()).not.toHaveAttribute("inert");
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(deleteButton());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("stays closed on a short swipe, a vertical scroll, or a mouse drag", () => {
    render(<Row />);
    const row = screen.getByTestId("swipe-row");
    swipe(row, -30);
    swipe(row, -20, 200);
    swipe(row, -200, 0, "mouse");
    expect(deleteButton()).toBeNull();
  });

  it("closes instead of opening the receipt when an open row is tapped", () => {
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} />);
    swipe(screen.getByTestId("swipe-row"), -120);
    // The click the browser may send at the end of the swipe is ignored.
    fireEvent.click(screen.getByRole("button", { name: "ICA" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(deleteButton()).not.toHaveAttribute("inert");

    vi.advanceTimersByTime(500);
    fireEvent.click(screen.getByRole("button", { name: "ICA" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(deleteButton()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ICA" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
