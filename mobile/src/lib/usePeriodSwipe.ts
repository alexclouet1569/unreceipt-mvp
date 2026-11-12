// Swipe sideways on the Insights screen to go to the period before or after
// (the ‹ › arrows stay for VoiceOver and a tap). The content follows the
// finger a little and springs back as the new period loads; a selection
// haptic marks the change. The charts read a sideways finger themselves:
// as deeper views they win the gesture there, so reading a bar never
// changes the period. Once a swipe has started it keeps the finger (the
// page's scroll can't take it over), and `onActive` lets the screen stop
// scrolling up and down meanwhile.

import { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, PanResponder } from "react-native";
import * as Haptics from "expo-haptics";
import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { springs } from "../theme";
import { followOffset, isSideways, swipeTarget } from "./swipe";

export function usePeriodSwipe(
  onPrevious: (() => void) | null,
  onNext: (() => void) | null,
  onActive?: (active: boolean) => void,
) {
  const offset = useSharedValue(0);
  const latest = useRef({ onPrevious, onNext, onActive });
  latest.current = { onPrevious, onNext, onActive };

  // Under Reduce Motion the content doesn't follow the finger; the swipe
  // still works. Followed live, like the hero's rolling number.
  const reduceMotion = useRef(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
      reduceMotion.current = on;
    });
    return () => sub.remove();
  }, []);

  const responder = useMemo(() => {
    const end = () => {
      offset.value = withSpring(0, springs.settle);
      latest.current.onActive?.(false);
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => isSideways(g.dx, g.dy),
      onPanResponderGrant: () => latest.current.onActive?.(true),
      // The page's vertical scroll must not end a sideways swipe half-way.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (reduceMotion.current) return;
        const { onPrevious: p, onNext: n } = latest.current;
        offset.value = followOffset(g.dx, { previous: p != null, next: n != null });
      },
      onPanResponderRelease: (_e, g) => {
        const { onPrevious: p, onNext: n } = latest.current;
        const target = swipeTarget(g.dx, g.vx, { previous: p != null, next: n != null });
        end();
        if (target) {
          void Haptics.selectionAsync();
          (target === "previous" ? p : n)?.();
        }
      },
      onPanResponderTerminate: end,
    });
  }, [offset]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return { handlers: responder.panHandlers, style };
}
