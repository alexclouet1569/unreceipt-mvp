import { C, F } from "../brand";
import { Wordmark } from "./Wordmark";
import { ReceiptRow, type RowData } from "./ReceiptRow";

export const LIST_TOP = 172;
export const ROW_STEP = 80;

/**
 * The app's receipt list. `rows` are drawn top to bottom; each can carry an
 * entrance progress (0–1) and a highlight.
 */
export function HomeScreen({
  rows,
  notice = 0,
  noticeText,
  above,
}: {
  rows: { row: RowData; p?: number; highlight?: number }[];
  notice?: number;
  noticeText?: string;
  /** Extra block between the header and the list (e.g. the VAT panel), with its height. */
  above?: { node: React.ReactNode; height: number; p: number };
}) {
  const pushNotice = notice * 62;
  const pushAbove = above ? above.p * (above.height + 10) : 0;
  let y = LIST_TOP + pushNotice + pushAbove;
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: F.sans }}>
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 0,
          right: 0,
          height: 56,
          borderBottom: `1px solid ${C.hairline}`,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
        }}
      >
        <Wordmark size={21} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 122,
          left: 18,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: "-0.02em",
          color: C.ink,
        }}
      >
        Your receipts
      </div>
      {notice > 0 && noticeText ? (
        <div
          style={{
            position: "absolute",
            top: LIST_TOP - 4,
            left: 14,
            right: 14,
            height: 52,
            borderRadius: 12,
            background: C.brandTint,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            fontSize: 15,
            fontWeight: 600,
            color: C.ink,
            opacity: notice,
            transform: `translateY(${(1 - notice) * -10}px)`,
          }}
        >
          <span>{noticeText}</span>
          <span style={{ color: C.brandAction, fontWeight: 700 }}>Review ›</span>
        </div>
      ) : null}
      {above ? (
        <div
          style={{
            position: "absolute",
            top: LIST_TOP - 4 + pushNotice,
            left: 14,
            right: 14,
            opacity: above.p,
            transform: `translateY(${(1 - above.p) * -10}px)`,
          }}
        >
          {above.node}
        </div>
      ) : null}
      {rows.map(({ row, p = 1, highlight = 0 }) => {
        const top = y;
        y += ROW_STEP * p;
        if (p <= 0) return null;
        return (
          <div
            key={row.merchant}
            style={{
              position: "absolute",
              top,
              left: 14,
              right: 14,
              opacity: p,
              transform: `scale(${0.96 + 0.04 * p})`,
            }}
          >
            <ReceiptRow row={row} highlight={highlight} />
          </div>
        );
      })}
    </div>
  );
}
