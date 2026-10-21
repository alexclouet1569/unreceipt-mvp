// SERVER-ONLY. The printable expense claim for one month (/app/claims →
// "Download claim PDF"): a summary page laid out like a French note de
// frais, then the receipts themselves, two per page, each with the number
// the person writes on the stapled original. React-PDF primitives — never
// import from a "use client" file.
//
// Printed on an office printer, so the page is white (no brand-tint
// background as on the single-receipt PDF) and the colours are few.

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatAmount } from "@/lib/receipt-format";
import {
  claimDayLabel,
  claimMonthLabel,
  claimTypeLabel,
  type ClaimLine,
  type ClaimTotal,
} from "@/lib/claims/claim";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";
import { PdfWordmark, ensureFonts } from "./ReceiptPdf";

const COLOR = {
  ink: "#303568",
  inkMuted: "#5A5F7A",
  inkFaint: "#8A8DAB",
  hairline: "#E5E1D8",
  attention: "#8C6320",
  surface: "#FAFAF7",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    padding: 32,
    fontFamily: "Manrope",
    fontSize: 9,
    color: COLOR.ink,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  micro: {
    fontSize: 8,
    fontWeight: 700,
    color: COLOR.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: COLOR.inkMuted, marginBottom: 16 },
  table: { borderTop: `1pt solid ${COLOR.ink}` },
  row: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${COLOR.hairline}`,
    paddingVertical: 5,
  },
  headRow: {
    flexDirection: "row",
    borderBottom: `1pt solid ${COLOR.ink}`,
    paddingVertical: 5,
  },
  head: { fontSize: 7.5, fontWeight: 700, color: COLOR.inkMuted, textTransform: "uppercase" },
  cNo: { width: 22 },
  cDate: { width: 62 },
  cTime: { width: 32 },
  cPlace: { width: 78, paddingRight: 4 },
  cPurpose: { flex: 1, paddingRight: 4 },
  cType: { width: 70 },
  cAmount: { width: 64, textAlign: "right" },
  amount: { fontWeight: 700 },
  totals: { marginTop: 18, alignSelf: "flex-end", width: 260 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottom: `0.5pt solid ${COLOR.hairline}`,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderTop: `1pt solid ${COLOR.ink}`,
    marginTop: 2,
  },
  grand: { fontSize: 11, fontWeight: 700 },
  note: { marginTop: 18, fontSize: 8.5, color: COLOR.inkMuted, lineHeight: 1.5 },
  attention: { color: COLOR.attention },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLOR.inkFaint,
  },
  sheetGrid: { flexDirection: "row", gap: 16, flexGrow: 1 },
  cell: {
    flex: 1,
    border: `0.5pt solid ${COLOR.hairline}`,
    padding: 10,
  },
  cellHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    border: `1.5pt solid ${COLOR.ink}`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  badgeText: { fontSize: 12, fontWeight: 700 },
  cellTitle: { fontSize: 10, fontWeight: 700 },
  cellMeta: { fontSize: 8, color: COLOR.inkMuted, marginTop: 1 },
  imageBox: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  image: { objectFit: "contain", maxWidth: "100%", maxHeight: 640 },
  placeholder: {
    flexGrow: 1,
    backgroundColor: COLOR.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  placeholderText: { fontSize: 9, color: COLOR.inkMuted, textAlign: "center", lineHeight: 1.5 },
});

export type ClaimPdfImage =
  | { kind: "image"; data: Buffer; format: "jpg" | "png" }
  | {
      kind: "none";
      reason: "noPhoto" | "emailOriginal" | "notEmbeddable" | "photoFailed" | "tooManyPhotos";
    };

export type ClaimPdfProps = {
  locale?: Locale;
  month: string;
  person: string;
  lines: ClaimLine[];
  totals: { byType: ClaimTotal[]; byCurrency: Array<{ currency: string; amount: number; count: number }> };
  /** Receipt id → what to show on the receipts sheet. */
  images: Record<string, ClaimPdfImage>;
  pendingCount: number;
  generatedOn: string;
};

export function ClaimPdf({
  locale = "en",
  month,
  person,
  lines,
  totals,
  images,
  pendingCount,
  generatedOn,
}: ClaimPdfProps) {
  ensureFonts();
  const t = getMessages(locale).claims;
  const monthLabel = claimMonthLabel(month, locale);
  const pairs: ClaimLine[][] = [];
  for (let i = 0; i < lines.length; i += 2) pairs.push(lines.slice(i, i + 2));
  const footer = `${t.pdf.label} · ${monthLabel} · ${person}`;

  return (
    <Document title={`${t.pdf.label} ${month}`} author="UnReceipt" language={locale}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <PdfWordmark />
          <Text style={styles.micro}>{t.pdf.label}</Text>
        </View>
        <Text style={styles.title}>{monthLabel}</Text>
        <Text style={styles.subtitle}>{person}</Text>

        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.head, styles.cNo]}>{t.pdf.no}</Text>
            <Text style={[styles.head, styles.cDate]}>{t.pdf.date}</Text>
            <Text style={[styles.head, styles.cTime]}>{t.pdf.time}</Text>
            <Text style={[styles.head, styles.cPlace]}>{t.pdf.place}</Text>
            <Text style={[styles.head, styles.cPurpose]}>{t.pdf.purpose}</Text>
            <Text style={[styles.head, styles.cType]}>{t.pdf.type}</Text>
            <Text style={[styles.head, styles.cAmount]}>{t.pdf.amount}</Text>
          </View>
          {lines.map((line) => (
            <View key={line.receipt.id} style={styles.row} wrap={false}>
              <Text style={[styles.cNo, styles.amount]}>{line.number}</Text>
              <Text style={styles.cDate}>{claimDayLabel(line.date, locale)}</Text>
              <Text style={styles.cTime}>{line.time ?? "—"}</Text>
              <Text style={styles.cPlace}>{line.place || "—"}</Text>
              <Text style={styles.cPurpose}>
                {line.purpose || "—"}
                {line.receipt.merchant_name ? `\n${line.receipt.merchant_name}` : ""}
              </Text>
              <Text style={styles.cType}>{claimTypeLabel(line.type, locale)}</Text>
              <Text style={[styles.cAmount, styles.amount]}>
                {formatAmount(numberOrNull(line.receipt.total), line.receipt.currency, locale)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          {totals.byType.map((total) => (
            <View key={`${total.type}:${total.currency}`} style={styles.totalRow}>
              <Text>
                {claimTypeLabel(total.type, locale)} × {total.count}
              </Text>
              <Text style={styles.amount}>{formatAmount(total.amount, total.currency, locale)}</Text>
            </View>
          ))}
          {totals.byCurrency.map((c) => (
            <View key={c.currency} style={styles.grandRow}>
              <Text style={styles.grand}>{t.pdf.total}</Text>
              <Text style={styles.grand}>{formatAmount(c.amount, c.currency, locale)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          {lines.length > 0 ? t.pdf.attached(lines.length) : t.pdf.none}
          {pendingCount > 0 ? (
            <Text style={styles.attention}>{`\n${t.pdf.pending(pendingCount)}`}</Text>
          ) : null}
        </Text>

        <View style={styles.footer} fixed>
          <Text>{footer}</Text>
          <Text>{t.pdf.made(generatedOn)}</Text>
        </View>
      </Page>

      {pairs.map((pair) => (
        <Page key={pair[0].receipt.id} size="A4" style={styles.page}>
          <View style={styles.sheetGrid}>
            {pair.map((line) => (
              <ReceiptCell key={line.receipt.id} line={line} image={images[line.receipt.id]} locale={locale} />
            ))}
            {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
          <View style={styles.footer} fixed>
            <Text>{footer}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

function ReceiptCell({
  line,
  image,
  locale,
}: {
  line: ClaimLine;
  image: ClaimPdfImage | undefined;
  locale: Locale;
}) {
  const t = getMessages(locale).claims;
  const r = line.receipt;
  return (
    <View style={styles.cell}>
      <View style={styles.cellHead}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{line.number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cellTitle}>{r.merchant_name ?? t.receipt}</Text>
          <Text style={styles.cellMeta}>
            {`${claimDayLabel(line.date, locale)} · ${claimTypeLabel(line.type, locale)} · ${formatAmount(numberOrNull(r.total), r.currency, locale)}`}
          </Text>
        </View>
      </View>
      {image?.kind === "image" ? (
        <View style={styles.imageBox}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          <Image src={{ data: image.data, format: image.format }} style={styles.image} />
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {t.pdf[image?.kind === "none" ? image.reason : "noPhoto"]}
          </Text>
        </View>
      )}
    </View>
  );
}

function numberOrNull(v: number | string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
