import { C, F } from "../brand";

export type RowData = {
  merchant: string;
  initials: string;
  color: string;
  amount: string;
  suffix: string;
  meta: string;
  converted?: string;
  state: "to_confirm" | "confirmed";
};

/** The inbox card from DESIGN.md "Receipt list item", drawn a little larger. */
export function ReceiptRow({ row, highlight = 0 }: { row: RowData; highlight?: number }) {
  const toConfirm = row.state === "to_confirm";
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 14px",
        background: C.card,
        border: `1px solid ${highlight > 0 ? mix(C.hairline, C.brand, highlight) : C.hairline}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {toConfirm ? (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: C.attention }} />
      ) : null}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: row.color,
          color: "#fff",
          fontFamily: F.sans,
          fontWeight: 700,
          fontSize: 15,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {row.initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: F.sans,
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: "-0.01em",
            color: C.ink,
            whiteSpace: "nowrap",
          }}
        >
          {row.merchant}
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 13.5, marginTop: 3, color: C.inkMuted, whiteSpace: "nowrap" }}>
          {toConfirm ? (
            <span style={{ color: C.attentionDeep, fontWeight: 600 }}>To confirm · </span>
          ) : (
            <span style={{ color: C.brandAction, fontWeight: 700 }}>✓ </span>
          )}
          {row.meta}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: 19, color: C.ink, whiteSpace: "nowrap" }}>
          {row.amount}
          <span style={{ fontSize: 12, color: C.inkMuted, marginLeft: 3 }}>{row.suffix}</span>
        </div>
        {row.converted ? (
          <div style={{ fontFamily: F.mono, fontSize: 13, color: C.inkMuted, marginTop: 2, whiteSpace: "nowrap" }}>
            ≈ {row.converted}
            <span style={{ fontSize: 11, marginLeft: 3 }}>kr</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function mix(a: string, b: string, t: number) {
  const pa = parse(a);
  const pb = parse(b);
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m.join(",")})`;
}

function parse(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
