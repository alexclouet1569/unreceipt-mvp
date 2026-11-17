import { useCurrentFrame } from "remotion";
import { C, F } from "../brand";
import { enter } from "../anim";
import { useLayout } from "../layout";

export type Line = { text: string; at: number; green?: boolean; small?: boolean };

/** The scene's headline: each line rises in at its own frame and stays. */
export function Caption({ lines }: { lines: Line[] }) {
  const frame = useCurrentFrame();
  const { caption } = useLayout();
  return (
    <div
      style={{
        position: "absolute",
        left: caption.left,
        top: caption.top,
        width: caption.width,
        textAlign: caption.align,
        display: "flex",
        flexDirection: "column",
        alignItems: caption.align === "center" ? "center" : "flex-start",
        gap: caption.size * 0.12,
      }}
    >
      {lines.map((line) => {
        const p = enter(frame, line.at, 16);
        const size = line.small ? caption.size * 0.46 : caption.size;
        return (
          <div
            key={line.text}
            style={{
              fontFamily: line.small ? F.accent : F.sans,
              fontStyle: line.small ? "italic" : "normal",
              fontWeight: line.small ? 500 : 800,
              fontSize: size,
              lineHeight: line.small ? 1.35 : 1.06,
              letterSpacing: line.small ? "0" : "-0.03em",
              color: line.green ? C.brand : line.small ? C.inkMuted : C.ink,
              opacity: p,
              transform: `translateY(${(1 - p) * 28}px)`,
              marginTop: line.small ? caption.size * 0.18 : 0,
            }}
          >
            {line.text}
          </div>
        );
      })}
    </div>
  );
}
