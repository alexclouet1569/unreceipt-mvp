import { Easing, interpolate } from "remotion";

const entrance = Easing.bezier(0.32, 0.72, 0, 1);
const exit = Easing.bezier(0.4, 0, 1, 1);

/** 0 → 1 between `start` and `start + dur`, on DESIGN.md's entrance curve. */
export function enter(frame: number, start: number, dur = 14) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    easing: entrance,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** 1 → 0 between `start` and `start + dur`, on the exit curve. */
export function leave(frame: number, start: number, dur = 10) {
  return interpolate(frame, [start, start + dur], [1, 0], {
    easing: exit,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Scene times are written for the 30 s cut; `scaler` maps them onto a
 * shorter scene so the 15 s cut keeps the same order of events.
 */
export function scaler(duration: number, base: number) {
  const k = duration / base;
  return (f: number) => Math.round(f * k);
}
