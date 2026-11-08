"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

// Swipe a receipt card left to reveal "Delete", then tap it (DESIGN.md
// "Swipe to delete"). Two deliberate gestures, as in iOS Mail: a swipe alone
// never deletes. Touch and pen only, so a mouse click still just opens the
// receipt; the detail view's own Delete stays the keyboard and desktop path.

const ACTION_WIDTH = 88;
// Past this much movement the gesture is a swipe, not a tap or a scroll.
const SLOP = 8;

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
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiping = useRef(false);
  // A click arriving right after a swipe belongs to the swipe: it mustn't
  // open the receipt or close the row it just opened.
  const swallowClicksUntil = useRef(0);

  const base = open ? -ACTION_WIDTH : 0;
  const offset = drag ?? base;

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
    <div className="relative overflow-hidden rounded-[12px]">
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete receipt: ${label}`}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 bg-destructive text-[13px] font-semibold text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{ width: ACTION_WIDTH }}
      >
        <Trash2 className="size-5" aria-hidden="true" />
        Delete
      </button>
      <div
        data-testid="swipe-row"
        className="relative touch-pan-y"
        style={{
          transform: `translateX(${offset}px)`,
          transition: drag == null ? "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)" : "none",
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
      >
        {children}
      </div>
    </div>
  );
}
