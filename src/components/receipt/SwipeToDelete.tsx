"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

// Swipe a receipt card left to reveal "Delete", then tap it (DESIGN.md
// "Swipe to delete"). Two deliberate gestures, as in iOS Mail: a swipe alone
// never deletes, and the list offers Undo afterwards. Touch and pen only, so
// a mouse click still just opens the receipt; keyboard and screen-reader
// users delete from the detail view.

const ACTION_WIDTH = 88;
// Past this much movement the gesture is a swipe, not a tap or a scroll.
const SLOP = 8;
const ENTER = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT = "cubic-bezier(0.4, 0, 1, 1)";

export function SwipeToDelete({
  open,
  onOpenChange,
  onDelete,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  /** Names the receipt for the Delete button, e.g. "ICA, 245.00 kr". */
  label: string;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiping = useRef(false);
  // A click arriving right after a swipe belongs to the swipe: it mustn't
  // open the receipt or close the row it just opened.
  const swallowClicksUntil = useRef(0);

  const base = open ? -ACTION_WIDTH : 0;
  const offset = drag ?? base;
  // The action exists only while the card is moved, so pressing a closed
  // card (it scales down slightly) never shows a red edge behind it.
  const revealed = open || offset < 0;

  // An open row closes when the user touches anything else or scrolls.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!wrapperRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const scrolled = () => onOpenChange(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scrolled);
    };
  }, [open, onOpenChange]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    swiping.current = false;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!swiping.current) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
        // A vertical scroll: let the page have it.
        start.current = null;
        return;
      }
      if (Math.abs(dx) < SLOP) return;
      swiping.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // Follows the finger; beyond the button it moves at half speed.
    let next = base + dx;
    if (next < -ACTION_WIDTH) next = -ACTION_WIDTH + (next + ACTION_WIDTH) / 2;
    setDrag(Math.min(0, next));
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId || !swiping.current) return;
    swiping.current = false;
    swallowClicksUntil.current = Date.now() + 400;
    const opened = (drag ?? base) < -ACTION_WIDTH / 2;
    setDrag(null);
    onOpenChange(opened);
  };

  return (
    <div ref={wrapperRef} className="relative overflow-hidden rounded-[12px]">
      {revealed ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete receipt: ${label}`}
          inert={!open}
          className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 bg-destructive text-[13px] font-semibold text-destructive-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-destructive-foreground"
          style={{ width: ACTION_WIDTH }}
        >
          <Trash2 className="size-5" aria-hidden="true" />
          Delete
        </button>
      ) : null}
      <div
        data-testid="swipe-row"
        className="relative"
        style={{
          // Vertical scrolling and pinch-zoom stay with the page.
          touchAction: "pan-y pinch-zoom",
          transform: `translateX(${offset}px)`,
          transition: drag == null ? `transform 200ms ${open ? ENTER : EXIT}` : "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          const fromSwipe = Date.now() < swallowClicksUntil.current;
          if (fromSwipe || open) {
            // The click that ends a swipe, or a tap on an open row (closes it).
            e.preventDefault();
            e.stopPropagation();
            if (open && !fromSwipe) onOpenChange(false);
          }
        }}
        onKeyDownCapture={(e) => {
          // Enter / Space on an open card closes it rather than opening it.
          if (open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            e.stopPropagation();
            onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
