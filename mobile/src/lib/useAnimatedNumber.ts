// A number that rolls to its new value instead of jumping (a total that
// changes with the month, the Insights hero). About 420 ms on the entrance
// curve; instant with Reduce Motion, on the first value, and when the
// change is tiny. Runs on requestAnimationFrame: a few short renders of one
// Text, which keeps the formatting (Intl) on the JavaScript side.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

const DURATION = 420;

// DESIGN.md entrance curve cubic-bezier(0.32, 0.72, 0, 1), approximated by
// a strong ease-out: fast start, long soft landing.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
  reduceMotion = on;
});
AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
  reduceMotion = on;
});

export function useAnimatedNumber(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const frame = useRef<number | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    const start = from.current;
    if (first.current || reduceMotion || Math.abs(target - start) < 0.005) {
      first.current = false;
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / DURATION);
      const v = start + (target - start) * easeOut(t);
      from.current = v;
      setShown(t === 1 ? target : Math.round(v * 100) / 100);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [target]);

  return shown;
}
