// SERVER-ONLY. Renders the printable digital receipt as a React-PDF tree
// served by /api/receipts/[id]/pdf. Uses @react-pdf/renderer's primitive
// elements (`Page`, `View`, `Text`, `Svg`, `Path`, `Rect`) — these are NOT
// the same as DOM elements, so this file MUST NOT be imported from a
// `"use client"` component or anything that pulls into the client bundle.

import path from "node:path";
import {
  Document,
  Font,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { CATEGORY_CONFIG, formatAmount, formatDate } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";

// Bundled font registration. Done once per process — Font.register guards
// against duplicate registration internally so re-evaluation in dev (HMR)
// is harmless.
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Manrope",
    fonts: [
      { src: path.join(FONT_DIR, "Manrope-Regular.otf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Manrope-Medium.otf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Manrope-Bold.otf"), fontWeight: 700 },
      // The brand wordmark is ExtraBold (800) but we don't ship a separate
      // ExtraBold OTF — Bold renders close enough for the totals row, which
      // is the only place 800 would otherwise appear in body text.
      { src: path.join(FONT_DIR, "Manrope-Bold.otf"), fontWeight: 800 },
    ],
  });
  // Disable hyphenation entirely — receipt body text shouldn't break
  // mid-merchant or mid-amount.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

// Brand book palette (DESIGN.md). Mirrors the CSS custom properties used
// by the web app — kept inline because react-pdf has no `var()` support.
const COLOR = {
  brandTint: "#ECF7E7", // White Mist — page background
  cardBg: "#FFFFFF", // inner card surface
  hairline: "#E5E1D8", // 1px card border
  ink: "#303568", // Deep Space — primary ink
  inkMuted: "#5C5F86", // Deep Space @ ~70%
  inkFaint: "#8A8DAB", // Deep Space @ ~50%
  brand: "#27BE7B", // Green Mint — primary accent
  brandDeep: "#1F9D63", // Brand deep
  surface: "#FAFAF7", // Cream background (used inside isotype)
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR.brandTint,
    padding: 32,
    fontFamily: "Manrope",
    fontSize: 11,
    color: COLOR.ink,
  },
  card: {
    backgroundColor: COLOR.cardBg,
    border: `1pt solid ${COLOR.hairline}`,
    borderRadius: 8,
    padding: 28,
  },
  // Header band: Wordmark (left) + Receipt # (right).
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmarkText: {
    fontWeight: 800,
    fontSize: 22,
    letterSpacing: -0.4,
    marginLeft: 6,
  },
  receiptIdLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: COLOR.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  receiptIdValue: {
    fontSize: 10,
    fontWeight: 500,
    color: COLOR.inkMuted,
    marginTop: 2,
  },
  // Body block: 2-column label/value grid.
  body: {
    marginBottom: 24,
  },
  bodyRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottom: `0.5pt solid ${COLOR.hairline}`,
  },
  bodyLabel: {
    width: 120,
    fontSize: 10,
    fontWeight: 400,
    color: COLOR.inkMuted,
  },
  bodyValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: 500,
    color: COLOR.ink,
  },
  // Items table — only rendered if items[] has rows.
  itemsHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottom: `1pt solid ${COLOR.ink}`,
    marginTop: 8,
  },
  itemsHeaderCell: {
    fontSize: 9,
    fontWeight: 700,
    color: COLOR.ink,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottom: `0.5pt solid ${COLOR.hairline}`,
  },
  // Totals block — TOTAL is the visual hero.
  totals: {
    marginTop: 16,
    paddingTop: 12,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalsLabel: {
    fontSize: 11,
    fontWeight: 400,
    color: COLOR.inkMuted,
  },
  totalsValue: {
    fontSize: 11,
    fontWeight: 500,
    color: COLOR.ink,
  },
  totalDivider: {
    borderTop: `1pt solid ${COLOR.ink}`,
    marginTop: 6,
    paddingTop: 8,
  },
  totalLineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLineLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: COLOR.ink,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  totalLineValue: {
    fontSize: 24,
    fontWeight: 700,
    color: COLOR.ink,
    letterSpacing: -0.4,
  },
  footer: {
    marginTop: 24,
    paddingTop: 16,
    borderTop: `0.5pt solid ${COLOR.hairline}`,
  },
  footerLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLOR.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  footerValue: {
    fontSize: 10,
    fontWeight: 400,
    color: COLOR.ink,
    marginBottom: 8,
  },
  disclaimer: {
    marginTop: 32,
    fontSize: 8,
    fontWeight: 400,
    color: COLOR.inkFaint,
    textAlign: "center",
    lineHeight: 1.4,
  },
});

// Wordmark isotype, ported from src/components/brand/Wordmark.tsx so the
// PDF doesn't depend on rasterising an external SVG. Same path data, same
// brand-book "light" colour set (green body, navy arrow).
function PdfWordmark() {
  return (
    <View style={styles.wordmarkRow}>
      <Svg viewBox="0 0 64 64" width={26} height={26}>
        {/* Receipt body */}
        <Path
          d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z"
          fill={COLOR.brand}
        />
        {/* Inner text lines */}
        <Rect x={36} y={22} width={14} height={2.6} rx={1.3} fill={COLOR.surface} />
        <Rect x={33} y={29} width={20} height={2.6} rx={1.3} fill={COLOR.surface} />
        <Rect x={33} y={36} width={17} height={2.6} rx={1.3} fill={COLOR.surface} />
        <Rect x={33} y={43} width={14} height={2.6} rx={1.3} fill={COLOR.surface} />
        {/* Wrapping arrow */}
        <Path
          d="M30 26 A12 12 0 1 1 23 11"
          stroke={COLOR.ink}
          strokeWidth={3.5}
          strokeLinecap="round"
          fill="none"
        />
        <Path d="M19.5 11 L25.5 7.5 L25.5 14.5 Z" fill={COLOR.ink} />
      </Svg>
      <Text style={styles.wordmarkText}>
        <Text style={{ color: COLOR.ink }}>Un</Text>
        <Text style={{ color: COLOR.brand }}>Receipt</Text>
      </Text>
    </View>
  );
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export type ReceiptPdfProps = {
  receipt: Receipt;
};

export function ReceiptPdf({ receipt }: ReceiptPdfProps) {
  ensureFonts();

  const merchant = receipt.merchant_name ?? "Unknown merchant";
  const categoryLabel = CATEGORY_CONFIG[receipt.category]?.label ?? "Other";
  const dateLabel = formatDate(receipt.purchased_at ?? receipt.receipt_date);
  const showSubtotal = receipt.subtotal != null;
  const showTax = receipt.tax_amount != null && receipt.tax_amount > 0;
  const showTip = receipt.tip_amount != null && receipt.tip_amount > 0;
  const taxLabel =
    receipt.tax_rate != null ? `VAT (${receipt.tax_rate}%)` : "VAT";

  const sourceRef =
    receipt.intake_ref ||
    receipt.transaction_ref ||
    receipt.original_source_url ||
    null;

  return (
    <Document
      title={`UnReceipt — ${merchant}`}
      author="UnReceipt"
      creator="UnReceipt"
      producer="UnReceipt"
      subject="Digital receipt"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <PdfWordmark />
            <View>
              <Text style={styles.receiptIdLabel}>Receipt</Text>
              <Text style={styles.receiptIdValue}>
                #{receipt.receipt_number ?? shortId(receipt.id)}
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            <BodyRow label="Merchant" value={merchant} />
            {receipt.merchant_address ? (
              <BodyRow label="Address" value={receipt.merchant_address} />
            ) : null}
            <BodyRow label="Date" value={dateLabel} />
            <BodyRow label="Category" value={categoryLabel} />
            {receipt.merchant_vat_number ? (
              <BodyRow
                label="Merchant VAT"
                value={receipt.merchant_vat_number}
              />
            ) : null}
          </View>

          <View style={styles.totals}>
            {showSubtotal ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotal</Text>
                <Text style={styles.totalsValue}>
                  {formatAmount(receipt.subtotal, receipt.currency)}
                </Text>
              </View>
            ) : null}
            {showTax ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{taxLabel}</Text>
                <Text style={styles.totalsValue}>
                  {formatAmount(receipt.tax_amount, receipt.currency)}
                </Text>
              </View>
            ) : null}
            {showTip ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tip</Text>
                <Text style={styles.totalsValue}>
                  {formatAmount(receipt.tip_amount, receipt.currency)}
                </Text>
              </View>
            ) : null}
            <View style={styles.totalDivider}>
              <View style={styles.totalLineRow}>
                <Text style={styles.totalLineLabel}>Total</Text>
                <Text style={styles.totalLineValue}>
                  {formatAmount(receipt.total, receipt.currency)}
                </Text>
              </View>
            </View>
          </View>

          {receipt.payment_method ||
          receipt.card_last_four ||
          sourceRef ||
          receipt.notes ? (
            <View style={styles.footer}>
              {receipt.payment_method ? (
                <>
                  <Text style={styles.footerLabel}>Payment</Text>
                  <Text style={styles.footerValue}>
                    {receipt.payment_method}
                    {receipt.card_last_four
                      ? ` · Card ending ${receipt.card_last_four}`
                      : ""}
                  </Text>
                </>
              ) : null}
              {sourceRef ? (
                <>
                  <Text style={styles.footerLabel}>Source of record</Text>
                  <Text style={styles.footerValue}>{sourceRef}</Text>
                </>
              ) : null}
              {receipt.notes ? (
                <>
                  <Text style={styles.footerLabel}>Notes</Text>
                  <Text style={styles.footerValue}>{receipt.notes}</Text>
                </>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.disclaimer}>
            Captured by UnReceipt · unreceipt.com — This is a faithful digital
            copy of the original receipt; the original is retained on file.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

function BodyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.bodyRow}>
      <Text style={styles.bodyLabel}>{label}</Text>
      <Text style={styles.bodyValue}>{value}</Text>
    </View>
  );
}

/**
 * Sanitize a string into something safe for an HTTP filename. Strips path
 * separators and control chars; replaces whitespace with `-`. Caller is
 * expected to lowercase if desired. Empty / all-stripped input returns
 * "receipt".
 */
export function pdfFilenameSlug(input: string | null | undefined): string {
  const cleaned = (input ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s/\\:*?"<>|]+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned || "receipt";
}

export function pdfFilenameFor(receipt: Receipt): string {
  const merchant = pdfFilenameSlug(receipt.merchant_name ?? "receipt");
  const date = (receipt.purchased_at ?? receipt.receipt_date ?? "").slice(0, 10);
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "undated";
  return `unreceipt-${merchant}-${datePart}.pdf`;
}
