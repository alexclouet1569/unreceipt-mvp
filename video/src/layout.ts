import { useVideoConfig } from "remotion";

export type Shape = "portrait" | "square" | "landscape";

export type Layout = {
  shape: Shape;
  width: number;
  height: number;
  /** Where the headline sits. */
  caption: { left: number; top: number; width: number; size: number; align: "left" | "center" };
  /** Where the phone sits: horizontal center, top edge, scale of a 390-wide phone. */
  stage: { cx: number; top: number; scale: number };
};

// 9:16 keeps the top 250 px and bottom 420 px free of anything that matters:
// Reels, TikTok and Shorts draw their buttons and captions there.
/** Frame coordinates of a point given in phone-screen coordinates (390×844). */
export function toFrame(stage: Layout["stage"], x: number, y: number) {
  return { x: stage.cx + (x - 195) * stage.scale, y: stage.top + (12 + y) * stage.scale };
}

export function useLayout(): Layout {
  const { width, height } = useVideoConfig();
  const ratio = width / height;
  if (ratio < 0.8) {
    return {
      shape: "portrait",
      width,
      height,
      caption: { left: 80, top: 270, width: width - 160, size: 84, align: "center" },
      stage: { cx: width / 2, top: 590, scale: 1.42 },
    };
  }
  if (ratio < 1.3) {
    return {
      shape: "square",
      width,
      height,
      caption: { left: 70, top: 56, width: width - 140, size: 60, align: "center" },
      stage: { cx: width / 2, top: 262, scale: 1.26 },
    };
  }
  return {
    shape: "landscape",
    width,
    height,
    caption: { left: 140, top: 380, width: 740, size: 88, align: "left" },
    stage: { cx: 1390, top: 110, scale: 1.34 },
  };
}
