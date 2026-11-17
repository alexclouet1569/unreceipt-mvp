import { interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../brand";
import { enter, lerp, scaler } from "../anim";
import { Caption } from "../components/Caption";
import { PaperReceipt } from "../components/PaperReceipt";
import { Phone } from "../components/Phone";
import { Scene } from "../components/Scene";
import { useLayout } from "../layout";

const BASE = 240;

export function Snap({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const { stage } = useLayout();
  const s = scaler(duration, BASE);

  const phoneIn = enter(frame, 0, 16);
  const shutter = s(28);
  const flash = interpolate(frame, [shutter, shutter + 2, shutter + 9], [0, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const press = interpolate(frame, [shutter - 3, shutter, shutter + 5], [1, 0.88, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scanFrom = shutter + 6;
  const scanTo = s(100);
  const scan = interpolate(frame, [scanFrom, scanTo], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scanning = frame >= scanFrom && frame <= scanTo + 4;
  const sheet = enter(frame, s(78), 18);
  const firstFields = enter(frame, s(104), 14); // total + date: what the reader sends first
  const restFields = enter(frame, s(132), 14);
  const reading = 1 - firstFields;
  const savePress = s(186);
  const saved = enter(frame, savePress + 4, 10);
  const btnScale = interpolate(frame, [savePress - 3, savePress, savePress + 6], [1, 0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Field outlines appear as the scan line passes them (fractions of the receipt's height).
  const boxAt = (y: number) => enter(frame, lerp(scanFrom, scanTo, y), 6);
  const boxes = { merchant: boxAt(0.05), date: boxAt(0.14), total: boxAt(0.78), vat: boxAt(0.86) };

  // The photo shrinks into the top of the screen when the sheet comes up.
  const photoW = lerp(262, 150, sheet);
  const photoTop = lerp(96, 62, sheet);
  const pulse = 0.4 + 0.6 * Math.abs(Math.sin(frame / 6));

  return (
    <Scene duration={duration}>
      <Phone cx={stage.cx} top={stage.top} scale={stage.scale} opacity={phoneIn} dy={(1 - phoneIn) * 80}>
        <div style={{ position: "absolute", inset: 0, background: C.photoGround }} />
        <div
          style={{
            position: "absolute",
            left: 195 - photoW / 2,
            top: photoTop,
            width: photoW,
            transform: `rotate(${lerp(-3, -2, sheet)}deg)`,
          }}
        >
          <PaperReceipt width={photoW} boxes={boxes} />
          {scanning ? (
            <div
              style={{
                position: "absolute",
                left: -12,
                right: -12,
                top: `${scan * 100}%`,
                height: 3,
                background: C.brand,
              }}
            />
          ) : null}
        </div>
        <Brackets visible={1 - sheet} />
        <div
          style={{
            position: "absolute",
            left: 195 - 36,
            top: 650,
            width: 72,
            height: 72,
            borderRadius: 36,
            border: "4px solid #fff",
            display: "grid",
            placeItems: "center",
            opacity: 1 - sheet,
          }}
        >
          <div style={{ width: 56, height: 56, borderRadius: 28, background: "#fff", transform: `scale(${press})` }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />

        {/* Capture sheet */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: lerp(844, 262, sheet),
            bottom: 0,
            background: C.card,
            borderRadius: "16px 16px 0 0",
            padding: "18px 20px",
            fontFamily: F.sans,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
            {reading > 0.02 ? (
              <>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: C.brand, opacity: pulse }} />
                <span style={{ fontWeight: 600, fontSize: 15, color: C.inkMuted, opacity: reading }}>
                  Reading your receipt…
                </span>
              </>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 17, color: C.ink, opacity: firstFields }}>Check and save</span>
            )}
          </div>

          <div style={{ marginTop: 12, height: 62, position: "relative" }}>
            <Skeleton w={190} h={40} top={14} o={reading} />
            <div style={{ opacity: firstFields }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: C.inkMuted }}>TOTAL PAID</div>
              <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: 40, color: C.ink, letterSpacing: "-0.02em" }}>
                342,00<span style={{ fontSize: 18, color: C.inkMuted, marginLeft: 6 }}>kr</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, height: 52, position: "relative" }}>
            <Skeleton w={350} h={52} top={0} o={1 - restFields} radius={10} />
            <div
              style={{
                opacity: restFields,
                background: C.brandTint,
                borderRadius: 10,
                height: 52,
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 14,
                color: C.ink,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                VAT 12 % <span style={{ fontFamily: F.mono, fontWeight: 500 }}>36,64</span>
              </span>
              <span style={{ color: C.inkMuted }}>
                Excl. VAT <span style={{ fontFamily: F.mono, color: C.ink }}>305,36</span>
              </span>
            </div>
          </div>

          <div style={{ marginTop: 10, border: `1px solid ${C.hairline}`, borderRadius: 12 }}>
            <Field label="Merchant" value="ICA Maxi" o={restFields} />
            <Field label="Date" value="13 Nov 2026" o={firstFields} border />
            <Field label="Category" value="Meals" o={restFields} border />
          </div>

          <div
            style={{
              marginTop: 12,
              height: 50,
              borderRadius: 10,
              background: C.brandAction,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 17,
              transform: `scale(${btnScale})`,
              opacity: restFields,
            }}
          >
            {saved > 0.5 ? "✓  Receipt saved" : "Save receipt"}
          </div>
        </div>
      </Phone>
      <Caption
        lines={[
          { text: "Snap it.", at: s(6) },
          { text: "AI reads it in seconds.", at: s(62), green: true },
        ]}
      />
    </Scene>
  );
}

function Field({ label, value, o, border }: { label: string; value: string; o: number; border?: boolean }) {
  return (
    <div
      style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        borderTop: border ? `1px solid ${C.hairline}` : "none",
        fontSize: 15,
      }}
    >
      <span style={{ width: 92, color: C.inkMuted, fontWeight: 600 }}>{label}</span>
      <span style={{ position: "relative", flex: 1, height: 20 }}>
        <span style={{ position: "absolute", left: 0, top: 4, width: 120, height: 12, borderRadius: 6, background: C.skeleton, opacity: 1 - o }} />
        <span style={{ position: "absolute", left: 0, top: 0, fontWeight: 700, color: C.ink, opacity: o }}>{value}</span>
      </span>
    </div>
  );
}

function Skeleton({ w, h, top, o, radius = 8 }: { w: number; h: number; top: number; o: number; radius?: number }) {
  if (o <= 0) return null;
  return <div style={{ position: "absolute", left: 0, top, width: w, height: h, borderRadius: radius, background: C.skeleton, opacity: o }} />;
}

function Brackets({ visible }: { visible: number }) {
  const c = { position: "absolute" as const, width: 34, height: 34, borderColor: "#fff", borderStyle: "solid", opacity: visible * 0.9 };
  return (
    <>
      <div style={{ ...c, left: 40, top: 80, borderWidth: "4px 0 0 4px", borderRadius: "10px 0 0 0" }} />
      <div style={{ ...c, right: 40, top: 80, borderWidth: "4px 4px 0 0", borderRadius: "0 10px 0 0" }} />
      <div style={{ ...c, left: 40, top: 600, borderWidth: "0 0 4px 4px", borderRadius: "0 0 0 10px" }} />
      <div style={{ ...c, right: 40, top: 600, borderWidth: "0 4px 4px 0", borderRadius: "0 0 10px 0" }} />
    </>
  );
}
