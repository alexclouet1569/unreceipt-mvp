"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";

// A receipt photo you can zoom into to check the small print: pinch with two
// fingers, double-tap (or double-click) to zoom in and out, drag when zoomed,
// or use the + / − buttons. Pointer events work the same with touch, a mouse
// and a pen, in the iOS app's web view too. The page itself doesn't zoom
// (touch-action: none), so only the photo moves.

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const BUTTON_STEP = 1.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

type View = { scale: number; x: number; y: number };
type Point = { x: number; y: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Keeps the zoomed photo over its frame: at scale s the photo can move
 * (s − 1) / 2 of the frame's size each way, and none at scale 1.
 */
export function clampView(view: View, width: number, height: number): View {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const maxX = ((scale - 1) * width) / 2;
  const maxY = ((scale - 1) * height) / 2;
  return { scale, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) };
}

/**
 * The view at `scale` that keeps the point under `focus` (relative to the
 * frame's centre) where it is.
 */
export function zoomAround(view: View, scale: number, focus: Point): View {
  const ratio = scale / view.scale;
  return {
    scale,
    x: focus.x - (focus.x - view.x) * ratio,
    y: focus.y - (focus.y - view.y) * ratio,
  };
}

export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  // The gesture in progress: where it started, so moves are measured from
  // there rather than accumulated (no drift).
  const gesture = useRef<{ view: View; points: Point[] } | null>(null);
  const lastTap = useRef<{ time: number; point: Point } | null>(null);
  const moved = useRef(false);
  // While a finger is down the photo follows it exactly; afterwards it eases.
  const [dragging, setDragging] = useState(false);

  const frameSize = () => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0, left: rect?.left ?? 0, top: rect?.top ?? 0 };
  };

  /** A screen point relative to the frame's centre. */
  const fromCentre = (clientX: number, clientY: number): Point => {
    const { width, height, left, top } = frameSize();
    return { x: clientX - left - width / 2, y: clientY - top - height / 2 };
  };

  const apply = useCallback((next: View) => {
    const { width, height } = frameSize();
    setView(clampView(next, width, height));
  }, []);

  // Safari's own pinch gesture would zoom the whole page instead.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const stop = (e: Event) => e.preventDefault();
    frame.addEventListener("gesturestart", stop);
    frame.addEventListener("gesturechange", stop);
    return () => {
      frame.removeEventListener("gesturestart", stop);
      frame.removeEventListener("gesturechange", stop);
    };
  }, []);

  const startGesture = (current: View) => {
    gesture.current = { view: current, points: [...pointers.current.values()] };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, fromCentre(e.clientX, e.clientY));
    moved.current = pointers.current.size > 1;
    setDragging(true);
    startGesture(view);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, fromCentre(e.clientX, e.clientY));
    const now = [...pointers.current.values()];
    const start = gesture.current;
    if (now.length >= 2 && start.points.length >= 2) {
      const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const scale = clamp(
        start.view.scale * (dist(now[0], now[1]) / dist(start.points[0], start.points[1])),
        MIN_SCALE,
        MAX_SCALE,
      );
      const startMid = mid(start.points[0], start.points[1]);
      const zoomed = zoomAround(start.view, scale, startMid);
      const nowMid = mid(now[0], now[1]);
      apply({ scale, x: zoomed.x + nowMid.x - startMid.x, y: zoomed.y + nowMid.y - startMid.y });
      moved.current = true;
    } else if (now.length === 1 && start.points.length === 1) {
      const dx = now[0].x - start.points[0].x;
      const dy = now[0].y - start.points[0].y;
      if (Math.hypot(dx, dy) > 4) moved.current = true;
      if (start.view.scale > 1) apply({ ...start.view, x: start.view.x + dx, y: start.view.y + dy });
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    // The remaining finger continues from the current view.
    if (pointers.current.size > 0) {
      startGesture(view);
      return;
    }
    gesture.current = null;
    setDragging(false);
    if (!point || moved.current) return;
    const now = Date.now();
    const last = lastTap.current;
    if (
      last &&
      now - last.time < DOUBLE_TAP_MS &&
      Math.hypot(point.x - last.point.x, point.y - last.point.y) < DOUBLE_TAP_PX
    ) {
      lastTap.current = null;
      apply(view.scale > 1 ? { scale: 1, x: 0, y: 0 } : zoomAround(view, DOUBLE_TAP_SCALE, point));
    } else {
      lastTap.current = { time: now, point };
    }
  };

  const zoomBy = (factor: number) => apply(zoomAround(view, clamp(view.scale * factor, MIN_SCALE, MAX_SCALE), { x: 0, y: 0 }));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={frameRef}
        data-testid="zoom-frame"
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: dragging ? "none" : "transform 160ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      </div>
      <div className="flex items-center justify-center gap-3 pt-3">
        <button
          type="button"
          onClick={() => zoomBy(1 / BUTTON_STEP)}
          disabled={view.scale <= MIN_SCALE}
          aria-label="Zoom out"
          className="flex size-11 items-center justify-center rounded-full border border-white/40 text-white outline-none disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-white/60"
        >
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <span className="min-w-12 text-center text-[13px] font-medium text-white/80" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(BUTTON_STEP)}
          disabled={view.scale >= MAX_SCALE}
          aria-label="Zoom in"
          className="flex size-11 items-center justify-center rounded-full border border-white/40 text-white outline-none disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-white/60"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
