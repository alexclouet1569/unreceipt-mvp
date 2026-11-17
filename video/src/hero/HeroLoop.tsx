import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../brand";
import { enter, lerp } from "../anim";
import { PaperReceipt } from "../components/PaperReceipt";
import { Wordmark } from "../components/Wordmark";
import { loadFonts } from "../fonts";

loadFonts();

// The website's hero loop: one receipt's path through four steps, silent,
// 20 s at 30 fps, 1080×1080. Frame 0 and the last frame are the same empty
// card, so the browser's loop has no visible restart.
export const HERO_FRAMES = 600;

const STEPS = [
  { from: 0, to: 150, title: "Snap it or forward it", sub: "A paper receipt or a receipt email." },
  { from: 150, to: 300, title: "AI reads it", sub: "Merchant, date, total and VAT, in seconds." },
  { from: 300, to: 420, title: "You confirm", sub: "Check the fields, then one tap." },
  { from: 420, to: 570, title: "Your accountant has it", sub: "Sorted, VAT split out, ready to export." },
];
const FADE_OUT = 570; // everything leaves by 595, back to frame 0's empty card

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.32, 0.72, 0, 1);

/** 0 → 1 → 0: in at `a`, out at `b`. */
function window(frame: number, a: number, b: number, inDur = 14, outDur = 12) {
  return Math.min(enter(frame, a, inDur), 1 - enter(frame, b, outDur));
}

export function HeroLoop() {
  const frame = useCurrentFrame();
  const out = 1 - enter(frame, FADE_OUT, 22);

  return (
    <AbsoluteFill style={{ background: C.surface, fontFamily: F.sans, color: C.ink }}>
      <Progress frame={frame} out={out} />
      <Captions frame={frame} />
      <div style={{ position: "absolute", inset: 0, opacity: out }}>
        <StepOne frame={frame} />
        <StepTwo frame={frame} />
        <StepThree frame={frame} />
        <StepFour frame={frame} />
      </div>
      <div style={{ position: "absolute", right: 56, bottom: 44, opacity: 0.9 }}>
        <Wordmark size={30} />
      </div>
    </AbsoluteFill>
  );
}

function Progress({ frame, out }: { frame: number; out: number }) {
  return (
    <div style={{ position: "absolute", left: 64, right: 64, top: 64, display: "flex", gap: 14 }}>
      {STEPS.map((s, i) => {
        const fill = interpolate(frame, [s.from + 6, s.to - 6], [0, 1], clamp) * out;
        return (
          <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: C.hairline, overflow: "hidden" }}>
            <div style={{ width: `${fill * 100}%`, height: "100%", background: C.brand }} />
          </div>
        );
      })}
    </div>
  );
}

function Captions({ frame }: { frame: number }) {
  return (
    <>
      {STEPS.map((s, i) => {
        const end = i === STEPS.length - 1 ? FADE_OUT + 6 : s.to - 4;
        const p = window(frame, s.from + 6, end);
        if (p <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 64,
              right: 64,
              top: 116,
              opacity: p,
              transform: `translateY(${(1 - p) * 18}px)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: C.brandAction,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 34,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontWeight: 800, fontSize: 62, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{s.title}</span>
            </div>
            <div style={{ marginTop: 14, marginLeft: 84, fontSize: 36, fontWeight: 600, color: C.inkMuted }}>{s.sub}</div>
          </div>
        );
      })}
    </>
  );
}

// ── Step 1: a paper receipt and a receipt email arrive ─────────────────────

const PAPER_W = 400;

function StepOne({ frame }: { frame: number }) {
  // The paper stays through step 2; the email leaves at the end of step 1.
  const paperIn = enter(frame, 14, 22);
  const paperOut = enter(frame, 300, 16);
  const mailIn = enter(frame, 40, 22);
  const mailOut = enter(frame, 150, 16);
  const paperX = lerp(-460, 90, paperIn);
  return (
    <>
      {paperIn > 0 && paperOut < 1 ? (
        <div
          style={{
            position: "absolute",
            left: paperX,
            top: 380,
            width: PAPER_W,
            transform: `rotate(-4deg)`,
            opacity: 1 - paperOut,
            border: `1px solid ${C.hairline}`,
          }}
        >
          <PaperReceipt width={PAPER_W} boxes={scanBoxes(frame)} />
          <ScanLine frame={frame} />
        </div>
      ) : null}
      {mailIn > 0 && mailOut < 1 ? (
        <div
          style={{
            position: "absolute",
            left: lerp(1180, 545, mailIn) + mailOut * 80,
            top: 600,
            width: 480,
            opacity: 1 - mailOut,
          }}
        >
          <MailCard />
        </div>
      ) : null}
    </>
  );
}

function MailCard() {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.hairline}`,
        borderRadius: 22,
        padding: "24px 26px",
        display: "flex",
        gap: 20,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: 16,
          background: C.brandTint,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={C.brandAction} strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 32 }}>Uber Receipts</div>
        <div style={{ fontSize: 26, color: C.inkMuted, marginTop: 4 }}>Trip receipt · 23,40 €</div>
      </div>
    </div>
  );
}

// ── Step 2: AI reads the paper receipt ────────────────────────────────────

const SCAN_FROM = 172;
const SCAN_TO = 236;

function scanBoxes(frame: number) {
  const at = (y: number) => enter(frame, lerp(SCAN_FROM, SCAN_TO, y), 6) * (1 - enter(frame, 292, 10));
  return { merchant: at(0.05), date: at(0.14), total: at(0.78), vat: at(0.86) };
}

function ScanLine({ frame }: { frame: number }) {
  if (frame < SCAN_FROM || frame > SCAN_TO + 3) return null;
  const y = interpolate(frame, [SCAN_FROM, SCAN_TO], [0, 1], clamp);
  return <div style={{ position: "absolute", left: -16, right: -16, top: `${y * 100}%`, height: 5, background: C.brand }} />;
}

const FIELDS = [
  { label: "Merchant", value: "ICA Maxi", at: 0.05 },
  { label: "Date", value: "13 Nov 2026", at: 0.14 },
  { label: "Total", value: "342,00 kr", at: 0.78, mono: true },
  { label: "VAT 12 %", value: "36,64 kr", at: 0.86, mono: true },
];

/** The digital receipt: built in step 2, confirmed in step 3, filed in step 4. */
function DigitalCard({ frame, fieldsFrom }: { frame: number; fieldsFrom: (at: number) => number }) {
  const confirmAt = 362;
  const confirmed = frame >= confirmAt + 3;
  const press = interpolate(frame, [confirmAt - 4, confirmAt, confirmAt + 7], [1, 0.93, 1], clamp);
  const showButton = enter(frame, 316, 14);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 24, padding: "26px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 46 }}>
        <span style={{ fontWeight: 800, fontSize: 30 }}>Receipt</span>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            padding: "8px 16px",
            borderRadius: 999,
            background: confirmed ? C.brandTint : C.attentionTint,
            color: confirmed ? C.brandAction : C.attentionDeep,
            opacity: showButton,
          }}
        >
          {confirmed ? "✓ Confirmed" : "To confirm"}
        </span>
      </div>
      <div style={{ marginTop: 14 }}>
        {FIELDS.map((f, i) => {
          const p = fieldsFrom(f.at);
          return (
            <div
              key={f.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                height: 62,
                borderTop: i ? `2px dashed ${C.hairline}` : "none",
                fontSize: 30,
              }}
            >
              <span style={{ color: C.inkMuted, fontWeight: 600 }}>{f.label}</span>
              <span style={{ position: "relative", minWidth: 200, textAlign: "right" }}>
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 8,
                    width: 190,
                    height: 22,
                    borderRadius: 11,
                    background: C.skeleton,
                    opacity: 1 - p,
                  }}
                />
                <span
                  style={{
                    fontFamily: f.mono ? F.mono : F.sans,
                    fontWeight: f.mono ? 500 : 700,
                    opacity: p,
                    display: "inline-block",
                    transform: `translateX(${(1 - p) * -30}px)`,
                  }}
                >
                  {f.value}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 18,
          height: showButton * 76,
          overflow: "hidden",
          opacity: showButton,
        }}
      >
        <div
          style={{
            height: 76,
            borderRadius: 14,
            background: confirmed ? C.brandTint : C.brandAction,
            color: confirmed ? C.brandAction : "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 30,
            transform: `scale(${press})`,
          }}
        >
          {confirmed ? "✓ Confirmed" : "Confirm"}
        </div>
      </div>
    </div>
  );
}

function StepTwo({ frame }: { frame: number }) {
  // The card appears beside the paper and fills as the scan passes each field.
  const cardIn = enter(frame, 158, 18);
  if (cardIn <= 0 || frame >= 300) return null;
  const fieldsFrom = (at: number) => enter(frame, lerp(SCAN_FROM, SCAN_TO, at) + 6, 12);
  return (
    <div style={{ position: "absolute", left: 545, top: 420, width: 470, opacity: cardIn, transform: `translateY(${(1 - cardIn) * 30}px)` }}>
      <DigitalCard frame={frame} fieldsFrom={fieldsFrom} />
    </div>
  );
}

// ── Step 3: the owner confirms ───────────────────────────────────────────

function StepThree({ frame }: { frame: number }) {
  if (frame < 300 || frame >= 432) return null;
  // The card glides from beside the paper to the centre and grows a little.
  const move = interpolate(frame, [300, 322], [0, 1], { ...clamp, easing: ease });
  const left = lerp(545, 210, move);
  const width = lerp(470, 660, move);
  const leave = enter(frame, 420, 12);
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: lerp(420, 400, move),
        width,
        opacity: 1 - leave,
        transform: `scale(${1 - leave * 0.25})`,
        transformOrigin: "50% 100%",
      }}
    >
      <DigitalCard frame={frame} fieldsFrom={() => 1} />
      <Tap frame={frame} at={362} />
    </div>
  );
}

function Tap({ frame, at }: { frame: number; at: number }) {
  const r = interpolate(frame, [at - 2, at + 14], [0, 1], clamp);
  if (r <= 0 || r >= 1) return null;
  const size = 40 + r * 90;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 26 + 38,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginBottom: -size / 2,
        borderRadius: size,
        border: `5px solid ${C.brandAction}`,
        opacity: 1 - r,
      }}
    />
  );
}

// ── Step 4: it reaches the accountant ────────────────────────────────────

const LEDGER = [
  { m: "ICA Maxi", a: "342,00", isNew: true },
  { m: "SJ", a: "489,00" },
  { m: "Uber", a: "≈ 262,08" },
  { m: "Clas Ohlson", a: "1 450,00" },
];

function StepFour({ frame }: { frame: number }) {
  const p = enter(frame, 424, 18);
  if (p <= 0) return null;
  const newRow = enter(frame, 446, 16);
  const vat = enter(frame, 486, 16);
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: 380,
        width: 800,
        opacity: p,
        transform: `translateY(${(1 - p) * 40}px)`,
      }}
    >
      <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 24, overflow: "hidden" }}>
        <div
          style={{
            height: 64,
            background: C.surface,
            borderBottom: `1px solid ${C.hairline}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 24px",
          }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 16, height: 16, borderRadius: 8, background: C.hairline }} />
          ))}
          <span style={{ marginLeft: 16, fontSize: 26, fontWeight: 700, color: C.inkMuted }}>Your accountant</span>
        </div>
        <div style={{ padding: "18px 28px 26px" }}>
          {LEDGER.map((r, i) => {
            const rowP = r.isNew ? newRow : 1;
            return (
              <div
                key={r.m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: rowP * 78,
                  overflow: "hidden",
                  opacity: rowP,
                  borderTop: i > 0 ? `1px solid ${C.hairline}` : "none",
                  fontSize: 33,
                  background: r.isNew ? `rgba(236,247,231,${0.9 * (1 - enter(frame, 520, 30))})` : "transparent",
                  margin: "0 -12px",
                  padding: "0 12px",
                  borderRadius: 10,
                }}
              >
                <span style={{ color: C.brandAction, fontWeight: 800, width: 44 }}>✓</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{r.m}</span>
                <span style={{ fontFamily: F.mono }}>
                  {r.a}
                  <span style={{ fontSize: 20, color: C.inkMuted, marginLeft: 6 }}>kr</span>
                </span>
              </div>
            );
          })}
          <div
            style={{
              marginTop: 18,
              borderRadius: 14,
              background: C.brandTint,
              padding: "18px 22px",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 28,
              opacity: vat,
              transform: `translateY(${(1 - vat) * 14}px)`,
            }}
          >
            <span style={{ fontWeight: 700 }}>VAT</span>
            <span>
              {[
                ["25 %", "290,00"],
                ["12 %", "36,64"],
                ["6 %", "27,68"],
              ].map(([rate, amount], i) => (
                <span key={rate} style={{ marginLeft: i ? 26 : 0 }}>
                  <span style={{ fontWeight: 600, color: C.inkMuted }}>{rate}</span>{" "}
                  <span style={{ fontFamily: F.mono }}>{amount}</span>
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
