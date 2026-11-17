import { C, F } from "../brand";

// A thermal-paper receipt as it would look in a photo. The monospace here is
// the shop's printer, not the app's amount style.
const LINES: [string, string][] = [
  ["MJÖLK 3% 1,5L", "21,90"],
  ["KAFFE BRYGG 450G", "64,90"],
  ["BRÖD SURDEG", "39,00"],
  ["OST HUSHÅLL 1KG", "119,00"],
  ["ÄGG 12P", "42,90"],
  ["BANANER 1,2KG", "26,30"],
  ["PAPPERSPÅSE", "28,00"],
];

export type ScanBoxes = { merchant: number; date: number; total: number; vat: number };

export function PaperReceipt({
  width,
  boxes,
}: {
  width: number;
  /** 0–1 per field: how far its "read" outline has appeared. */
  boxes?: ScanBoxes;
}) {
  const s = width / 300;
  const box = (p = 0) => ({
    outline: p > 0 ? `${2 * s}px solid rgba(39,190,123,${p})` : "none",
    outlineOffset: 3 * s,
    borderRadius: 3 * s,
    background: p > 0 ? `rgba(39,190,123,${0.12 * p})` : "transparent",
  });
  const text = { fontFamily: F.mono, fontSize: 13 * s, color: "#2B2B33", lineHeight: 1.5 };
  return (
    <div
      style={{
        width,
        background: "#FDFCF8",
        padding: `${22 * s}px ${20 * s}px ${30 * s}px`,
        clipPath: zigzag(),
        ...text,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 10 * s }}>
        <div style={{ ...box(boxes?.merchant), display: "inline-block", fontWeight: 600, fontSize: 20 * s, letterSpacing: "0.04em" }}>
          ICA MAXI
        </div>
        <div style={{ fontSize: 11 * s, color: "#55555F" }}>Stormarknad · Org.nr 556123-4567</div>
        <div style={{ ...box(boxes?.date), display: "inline-block", fontSize: 11.5 * s, marginTop: 2 * s }}>
          2026-11-13 17:42
        </div>
      </div>
      <Dash s={s} />
      {LINES.map(([name, amount]) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{name}</span>
          <span>{amount}</span>
        </div>
      ))}
      <Dash s={s} />
      <div
        style={{
          ...box(boxes?.total),
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 600,
          fontSize: 16 * s,
        }}
      >
        <span>TOTALT</span>
        <span>342,00</span>
      </div>
      <div style={{ ...box(boxes?.vat), display: "flex", justifyContent: "space-between", fontSize: 11.5 * s, marginTop: 6 * s }}>
        <span>MOMS 12%  305,36</span>
        <span>36,64</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 11 * s, marginTop: 12 * s, color: "#55555F" }}>
        KORT •••• 4421 · TACK FÖR BESÖKET
      </div>
    </div>
  );
}

function Dash({ s }: { s: number }) {
  return <div style={{ borderTop: `${1.5 * s}px dashed #B8B6AE`, margin: `${8 * s}px 0` }} />;
}

function zigzag() {
  const teeth = 18;
  const pts = ["0% 0%", "100% 0%", "100% 97%"];
  for (let i = teeth; i >= 0; i--) {
    const x = (i / teeth) * 100;
    pts.push(`${x}% ${i % 2 === 0 ? 97 : 100}%`);
  }
  return `polygon(${pts.join(",")})`;
}
