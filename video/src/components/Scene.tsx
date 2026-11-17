import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "../brand";
import { enter, leave } from "../anim";

/** Cream page; the scene's content fades in at its start and out at its end. */
export function Scene({
  duration,
  children,
  fadeIn = 8,
  fadeOut = 8,
}: {
  duration: number;
  children: ReactNode;
  fadeIn?: number;
  fadeOut?: number;
}) {
  const frame = useCurrentFrame();
  const o = Math.min(fadeIn ? enter(frame, 0, fadeIn) : 1, fadeOut ? leave(frame, duration - fadeOut, fadeOut) : 1);
  return (
    <AbsoluteFill style={{ background: C.surface }}>
      <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}
