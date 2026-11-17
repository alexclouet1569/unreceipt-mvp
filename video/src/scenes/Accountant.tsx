import { interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../brand";
import { enter, leave, scaler } from "../anim";
import { Caption } from "../components/Caption";
import { HomeScreen, LIST_TOP, ROW_STEP } from "../components/HomeScreen";
import { Phone } from "../components/Phone";
import { Scene } from "../components/Scene";
import { EMAIL_ROWS, ICA, VAT_ROWS } from "../data";
import { toFrame, useLayout } from "../layout";

const BASE = 210;

export function Accountant({ duration, short }: { duration: number; short: boolean }) {
  const frame = useCurrentFrame();
  const { stage } = useLayout();
  const s = scaler(duration, BASE);

  // Long cut: confirm the three email receipts, show the VAT, then hand over.
  // Short cut: straight to the accountant's view.
  const taps = short ? [] : [s(16), s(32), s(48)];
  const vat = short ? 1 : enter(frame, s(64), 16);
  const handover = short ? 0 : s(104);
  const phoneOut = short ? 0 : leave(frame, handover, 14);
  const deskIn = short ? enter(frame, 0, 12) : enter(frame, handover + 6, 16);
  const exportPress = short ? Math.round(duration * 0.42) : s(160);
  const exported = enter(frame, exportPress + 4, 12);
  const btnScale = interpolate(frame, [exportPress - 3, exportPress, exportPress + 6], [1, 0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rows = [...EMAIL_ROWS].reverse().map((row, i) => {
    const tapAt = taps[i];
    const done = tapAt !== undefined ? frame >= tapAt + 4 : true;
    return { row: { ...row, state: done ? ("confirmed" as const) : row.state }, highlight: tapAt !== undefined ? ripple(frame, tapAt) : 0, tapAt };
  });

  return (
    <Scene duration={duration} fadeIn={short ? 8 : 0}>
      {phoneOut > 0 ? (
        <Phone cx={stage.cx} top={stage.top} scale={stage.scale} opacity={phoneOut} dy={(1 - phoneOut) * -40}>
          <HomeScreen
            rows={[...rows.map(({ row, highlight }) => ({ row, highlight })), { row: ICA }]}
            above={{ node: <VatPanel />, height: 112, p: vat }}
          />
        </Phone>
      ) : null}
      {phoneOut > 0
        ? rows.map(({ tapAt }, i) => {
            if (tapAt === undefined) return null;
            const r = interpolate(frame, [tapAt - 2, tapAt + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            if (r <= 0 || r >= 1) return null;
            const pos = toFrame(stage, 300, LIST_TOP + i * ROW_STEP + 34);
            const size = (24 + r * 50) * stage.scale;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: pos.x - size / 2,
                  top: pos.y - size / 2,
                  width: size,
                  height: size,
                  borderRadius: size,
                  border: `${3 * stage.scale}px solid ${C.brandAction}`,
                  opacity: 1 - r,
                }}
              />
            );
          })
        : null}
      {deskIn > 0 ? <Desk p={deskIn} exported={exported} btnScale={btnScale} /> : null}
      <Caption
        lines={[
          { text: "VAT split out.", at: short ? 2 : s(8) },
          { text: "Ready for your accountant.", at: short ? 10 : s(100), green: true },
        ]}
      />
    </Scene>
  );
}

function ripple(frame: number, at: number) {
  return interpolate(frame, [at - 2, at + 2, at + 16], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function VatPanel() {
  return (
    <div style={{ background: C.brandTint, borderRadius: 12, padding: "12px 16px", fontFamily: F.sans, color: C.ink }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: C.inkMuted }}>SWEDISH VAT THIS WEEK</div>
      {VAT_ROWS.map((v) => (
        <div key={v.rate} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginTop: 4 }}>
          <span style={{ fontWeight: 600 }}>{v.rate}</span>
          <span style={{ fontFamily: F.mono }}>
            {v.amount}
            <span style={{ fontSize: 11, color: C.inkMuted, marginLeft: 3 }}>kr</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const DESK_ROWS = [
  { m: "Clas Ohlson", a: "1 450,00", acc: "6110" },
  { m: "SJ", a: "489,00", acc: "5800" },
  { m: "ICA Maxi", a: "342,00", acc: "5830" },
  { m: "Uber", a: "≈ 262,08", acc: "5800" },
];

/** The accounting firm's view of the client's month, drawn as a browser window. */
function Desk({ p, exported, btnScale }: { p: number; exported: number; btnScale: number }) {
  const { stage, shape } = useLayout();
  const W = 470;
  const k = shape === "portrait" ? 1.85 : shape === "landscape" ? 1.62 : stage.scale * 1.04;
  return (
    <div
      style={{
        position: "absolute",
        left: stage.cx - (W / 2) * k,
        top: (shape === "portrait" ? 694 : shape === "landscape" ? 250 : stage.top + 30 * k) + (1 - p) * 60,
        width: W,
        transform: `scale(${k})`,
        transformOrigin: "top left",
        opacity: p,
        fontFamily: F.sans,
        color: C.ink,
      }}
    >
      <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 14, overflow: "hidden" }}>
        <div
          style={{
            height: 38,
            background: C.surface,
            borderBottom: `1px solid ${C.hairline}`,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "0 14px",
          }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: C.hairline }} />
          ))}
          <span style={{ marginLeft: 12, fontSize: 12.5, color: C.inkMuted }}>Your accountant · client view</span>
        </div>
        <div style={{ padding: "16px 18px 18px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: C.inkMuted }}>NOVEMBER · 4 RECEIPTS READY</div>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em", marginTop: 2 }}>Nordic Café AB</div>
          <div style={{ marginTop: 12, border: `1px solid ${C.hairline}`, borderRadius: 10 }}>
            {DESK_ROWS.map((r, i) => (
              <div
                key={r.m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 42,
                  padding: "0 12px",
                  borderTop: i ? `1px solid ${C.hairline}` : "none",
                  fontSize: 15,
                }}
              >
                <span style={{ color: C.brandAction, fontWeight: 800, width: 22 }}>✓</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{r.m}</span>
                <span style={{ color: C.inkMuted, fontSize: 13, width: 56, fontVariantNumeric: "tabular-nums" }}>{r.acc}</span>
                <span style={{ fontFamily: F.mono, width: 106, textAlign: "right" }}>
                  {r.a}
                  <span style={{ fontSize: 11, color: C.inkMuted, marginLeft: 3 }}>kr</span>
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              height: 46,
              borderRadius: 10,
              background: exported > 0.5 ? C.brandTint : C.brandAction,
              color: exported > 0.5 ? C.ink : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              fontWeight: 700,
              fontSize: 15.5,
              transform: `scale(${btnScale})`,
            }}
          >
            {exported > 0.5 ? (
              <>
                <span style={{ color: C.brandAction }}>✓</span> bookkeeping.csv · receipts.zip
              </>
            ) : (
              "Export for bookkeeping"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
