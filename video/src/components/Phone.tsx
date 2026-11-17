import type { ReactNode } from "react";
import { C, F } from "../brand";

export const PHONE_W = 390;
export const PHONE_H = 844;

/**
 * A plain phone outline drawn in Deep Space, holding a 390×844 screen.
 * Positioned by its top-center point and scaled as a whole.
 */
export function Phone({
  cx,
  top,
  scale,
  children,
  opacity = 1,
  dy = 0,
}: {
  cx: number;
  top: number;
  scale: number;
  children: ReactNode;
  opacity?: number;
  dy?: number;
}) {
  const bezel = 12;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - (PHONE_W / 2 + bezel) * scale,
        top: top + dy,
        width: PHONE_W + bezel * 2,
        height: PHONE_H + bezel * 2,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 62,
          background: C.ink,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: bezel,
          top: bezel,
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: 50,
          overflow: "hidden",
          background: C.surface,
        }}
      >
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 34px 0",
        fontFamily: F.sans,
        fontWeight: 700,
        fontSize: 16,
        color: C.ink,
        zIndex: 5,
      }}
    >
      <span style={{ fontVariantNumeric: "tabular-nums" }}>9:41</span>
      <div style={{ width: 110, height: 30, borderRadius: 20, background: C.ink, marginTop: 4 }} />
      <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <span style={{ width: 18, height: 11, borderRadius: 2, background: C.ink, opacity: 0.85 }} />
        <span style={{ width: 24, height: 12, borderRadius: 4, border: `2px solid ${C.ink}` }} />
      </span>
    </div>
  );
}
