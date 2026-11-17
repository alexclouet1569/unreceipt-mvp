import { random, useCurrentFrame } from "remotion";
import { C, F } from "../brand";
import { enter, lerp } from "../anim";
import { Caption } from "../components/Caption";
import { Scene } from "../components/Scene";
import { useLayout } from "../layout";

type Item =
  | { kind: "paper"; shop: string; amount: string }
  | { kind: "mail"; from: string; subject: string }
  | { kind: "alert"; text: string };

const ITEMS: Item[] = [
  { kind: "paper", shop: "ICA MAXI", amount: "342,00" },
  { kind: "mail", from: "Uber Receipts", subject: "Your Thursday trip" },
  { kind: "paper", shop: "PRESSBYRÅN", amount: "68,00" },
  { kind: "mail", from: "SJ", subject: "Kvitto för din resa" },
  { kind: "paper", shop: "CLAS OHLSON", amount: "1 450,00" },
  { kind: "mail", from: "Scandic Hotels", subject: "Your invoice #4821" },
  { kind: "paper", shop: "APOTEKET", amount: "212,00" },
  { kind: "mail", from: "SAS", subject: "Booking receipt" },
  { kind: "paper", shop: "COOP", amount: "890,00" },
  { kind: "mail", from: "Spotify", subject: "Your receipt" },
  { kind: "paper", shop: "SHELL", amount: "€ 64,20" },
  { kind: "mail", from: "Adobe", subject: "Invoice for November" },
  { kind: "alert", text: "Month-end in 2 days" },
  { kind: "paper", shop: "PAUL", amount: "€ 18,50" },
  { kind: "mail", from: "Clas Ohlson", subject: "Order confirmation" },
  { kind: "alert", text: "4 receipts missing" },
];

export function Hook({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const layout = useLayout();
  const { shape, width, height, stage } = layout;
  const zone =
    shape === "portrait"
      ? { x0: 40, x1: width - 40, y0: 600, y1: 1480, k: 1.25 }
      : shape === "square"
        ? { x0: 30, x1: width - 30, y0: 280, y1: height - 20, k: 0.95 }
        : { x0: 980, x1: width - 30, y0: 60, y1: height - 40, k: 1.05 };
  const settle = duration * 0.8;
  const sweepStart = duration - 16;
  const sink = { x: stage.cx, y: shape === "landscape" ? height / 2 : (zone.y0 + zone.y1) / 2 };

  return (
    <Scene duration={duration} fadeIn={0} fadeOut={6}>
      {ITEMS.map((item, i) => {
        // The first few are already there on frame 0 (the thumbnail), the rest pile on.
        const t = (i - 3) * ((settle - 4) / ITEMS.length);
        const p = enter(frame, t, 10);
        if (p <= 0) return null;
        const w = (item.kind === "paper" ? 190 : item.kind === "alert" ? 380 : 400) * zone.k;
        const h = (item.kind === "paper" ? 250 : item.kind === "alert" ? 74 : 92) * zone.k;
        const x = lerp(zone.x0, zone.x1 - w, random(`x${i}`));
        const y = lerp(zone.y0, zone.y1 - h, random(`y${i}`));
        const rot = (random(`r${i}`) - 0.5) * (item.kind === "paper" ? 30 : 14);
        const sweep = enter(frame, sweepStart + (i % 4), 12);
        const cx = lerp(x + w / 2, sink.x, sweep);
        const cy = lerp(y + h / 2, sink.y, sweep);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx - w / 2,
              top: cy - h / 2 - (1 - p) * 90,
              width: w,
              height: h,
              opacity: p * (1 - sweep),
              transform: `rotate(${rot + (1 - p) * 12}deg) scale(${1 - sweep * 0.8})`,
            }}
          >
            {item.kind === "paper" ? (
              <Slip item={item} k={zone.k} />
            ) : item.kind === "alert" ? (
              <Alert text={item.text} k={zone.k} />
            ) : (
              <Mail item={item} k={zone.k} />
            )}
          </div>
        );
      })}
      <Caption lines={[{ text: "Still chasing receipts?", at: -16 }]} />
    </Scene>
  );
}

function Slip({ item, k }: { item: Extract<Item, { kind: "paper" }>; k: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#FFFFFF",
        border: `${1.5 * k}px solid #D9D5CA`,
        padding: `${16 * k}px ${14 * k}px`,
        fontFamily: F.mono,
        fontSize: 12 * k,
        color: "#3A3A44",
        display: "flex",
        flexDirection: "column",
        gap: 7 * k,
      }}
    >
      <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14 * k }}>{item.shop}</div>
      {[0.8, 0.6, 0.7, 0.5].map((wd, j) => (
        <div key={j} style={{ height: 6 * k, width: `${wd * 100}%`, background: "#E4E1D8", borderRadius: 3 }} />
      ))}
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
        <span>TOTAL</span>
        <span>{item.amount}</span>
      </div>
    </div>
  );
}

function Mail({ item, k }: { item: Extract<Item, { kind: "mail" }>; k: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: C.card,
        border: `${1.5 * k}px solid #D9D5CA`,
        borderRadius: 18 * k,
        display: "flex",
        alignItems: "center",
        gap: 14 * k,
        padding: `0 ${18 * k}px`,
        fontFamily: F.sans,
      }}
    >
      <div
        style={{
          width: 48 * k,
          height: 48 * k,
          borderRadius: 12 * k,
          background: C.surface,
          border: `1px solid ${C.hairline}`,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <svg width={24 * k} height={24 * k} viewBox="0 0 24 24" fill="none" stroke={C.inkMuted} strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 17 * k, color: C.ink, whiteSpace: "nowrap" }}>{item.from}</div>
        <div style={{ fontSize: 15 * k, color: C.inkMuted, whiteSpace: "nowrap" }}>{item.subject}</div>
      </div>
    </div>
  );
}

function Alert({ text, k }: { text: string; k: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: C.card,
        border: `${2 * k}px solid ${C.negative}`,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10 * k,
        fontFamily: F.sans,
        fontWeight: 800,
        fontSize: 22 * k,
        color: C.negative,
      }}
    >
      <span style={{ fontSize: 24 * k }}>!</span>
      {text}
    </div>
  );
}
