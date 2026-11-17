import { useCurrentFrame } from "remotion";
import { C, F } from "../brand";
import { enter, scaler } from "../anim";
import { Scene } from "../components/Scene";
import { Wordmark } from "../components/Wordmark";
import { useLayout } from "../layout";

const BASE = 150;

export function End({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const { shape, height } = useLayout();
  const s = scaler(duration, BASE);
  const mark = enter(frame, 2, 16);
  const line = enter(frame, s(20), 16);
  const cta = enter(frame, s(44), 16);
  const k = shape === "landscape" ? 1 : shape === "square" ? 0.92 : 1.18;
  // 9:16: centre in the safe band (250 px top, 420 px bottom).
  const centerY = shape === "portrait" ? 250 + (height - 670) / 2 : height / 2;
  const rise = (p: number) => ({ opacity: p, transform: `translateY(${(1 - p) * 24}px)` });

  return (
    <Scene duration={duration} fadeOut={0}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: centerY,
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 44 * k,
          padding: "0 70px",
        }}
      >
        <div style={rise(mark)}>
          <Wordmark size={92 * k} />
        </div>
        <div
          style={{
            ...rise(line),
            fontFamily: F.sans,
            fontWeight: 800,
            fontSize: 70 * k,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            color: C.ink,
          }}
        >
          From chaos to clarity —<br />
          <span style={{ color: C.brand }}>automatically.</span>
        </div>
        <div style={{ ...rise(cta), display: "flex", flexDirection: "column", alignItems: "center", gap: 18 * k }}>
          <div
            style={{
              background: C.brandAction,
              color: "#fff",
              fontFamily: F.sans,
              fontWeight: 800,
              fontSize: 44 * k,
              padding: `${22 * k}px ${48 * k}px`,
              borderRadius: 999,
            }}
          >
            Join the free pilot
          </div>
          <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 40 * k, color: C.ink }}>unreceipt.com</div>
        </div>
      </div>
    </Scene>
  );
}
