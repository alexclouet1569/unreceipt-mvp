import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../brand";
import { enter, lerp, scaler } from "../anim";
import { Caption } from "../components/Caption";
import { HomeScreen, LIST_TOP } from "../components/HomeScreen";
import { Phone } from "../components/Phone";
import { Scene } from "../components/Scene";
import { EMAIL_ROWS, EMAIL_SUBJECTS, ICA } from "../data";
import { toFrame, useLayout } from "../layout";

const BASE = 210;

export function Email({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const layout = useLayout();
  const { stage, shape, width } = layout;
  const s = scaler(duration, BASE);
  const arrivals = [s(18), s(52), s(86)];
  const flight = Math.max(12, s(28));
  const notice = enter(frame, s(128), 14);

  // Newest first: the last arrival sits on top.
  const rows = [
    ...EMAIL_ROWS.map((row, i) => ({ row, p: enter(frame, arrivals[i] + flight - 4, 12), i })).reverse(),
    { row: ICA, p: 1, i: -1 },
  ];
  const target = toFrame(stage, 195, LIST_TOP + 30);

  return (
    <Scene duration={duration}>
      <Phone cx={stage.cx} top={stage.top} scale={stage.scale}>
        <HomeScreen
          rows={rows.map(({ row, p }) => ({ row, p }))}
          notice={notice}
          noticeText="3 new receipts from your email"
        />
      </Phone>
      {EMAIL_SUBJECTS.map((mail, i) => {
        const t = interpolate(frame, [arrivals[i], arrivals[i] + flight], [0, 1], {
          easing: Easing.inOut(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (t <= 0 || t >= 1) return null;
        const side = shape === "landscape" ? 1 : i % 2 === 0 ? -1 : 1;
        const startX = shape === "landscape" ? width + 120 : side < 0 ? -120 : width + 120;
        const startY = target.y;
        const x = lerp(startX, target.x, t);
        const y = lerp(startY, target.y, t);
        const k = stage.scale * lerp(1.15, 1, t);
        return (
          <div
            key={mail.subject}
            style={{
              position: "absolute",
              left: x - 181 * k,
              top: y - 34 * k,
              width: 362,
              transform: `scale(${k})`,
              transformOrigin: "top left",
              opacity: t < 0.9 ? 1 : (1 - t) / 0.1,
            }}
          >
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.hairline}`,
                borderRadius: 16,
                padding: "12px 16px",
                fontFamily: F.sans,
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={C.brandAction} strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{mail.from}</div>
                <div style={{ fontSize: 13.5, color: C.inkMuted, whiteSpace: "nowrap" }}>{mail.subject}</div>
              </div>
            </div>
          </div>
        );
      })}
      <Caption
        lines={[
          { text: "Email receipts", at: s(6) },
          { text: "arrive on their own.", at: s(14), green: true },
          { text: "Connect Gmail or Outlook, or just forward them.", at: s(40), small: true },
        ]}
      />
    </Scene>
  );
}
