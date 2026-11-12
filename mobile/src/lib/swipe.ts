// When a sideways swipe on the Insights screen changes the period. Pure, so
// it is tested (src/lib/__tests__/swipe.test.ts); the gesture lives in
// usePeriodSwipe.ts.

/** Far enough (points) or fast enough (points per ms) to count as a swipe. */
export const SWIPE_DISTANCE = 64;
export const SWIPE_VELOCITY = 0.45;

/**
 * Starts as a period swipe only when the finger moves clearly sideways, so
 * a vertical scroll never turns into one.
 */
export function isSideways(dx: number, dy: number): boolean {
  return Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 2;
}

/**
 * Where a finished swipe goes: right (finger to the right) is the period
 * before, left the one after; null when it was too short or there is no
 * period that way (the future, or while one is loading).
 */
export function swipeTarget(
  dx: number,
  vx: number,
  can: { previous: boolean; next: boolean },
): "previous" | "next" | null {
  // A flick counts only in the direction the finger travelled: dragging
  // right then flicking back left isn't a swipe to the previous period.
  const flick = Math.abs(vx) >= SWIPE_VELOCITY && Math.sign(vx) === Math.sign(dx);
  const far = Math.abs(dx) >= SWIPE_DISTANCE || flick;
  if (!far) return null;
  if (dx > 0 && can.previous) return "previous";
  if (dx < 0 && can.next) return "next";
  return null;
}

/** How far the content follows the finger: a third of the way, less where it can't go. */
export function followOffset(dx: number, can: { previous: boolean; next: boolean }): number {
  const allowed = dx > 0 ? can.previous : can.next;
  return dx * (allowed ? 0.33 : 0.1);
}
