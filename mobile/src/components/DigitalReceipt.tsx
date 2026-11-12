// The digital receipt (DESIGN.md "Digital receipt", the website's
// ReceiptDetailCard): a paper copy branded UnReceipt, with a perforated top
// and a torn bottom. Merchant, total, date and category come from the list's
// copy (the phone's edits show at once) and each opens its own editor; the
// rest (items, VAT, payment, stamp) from GET /api/mobile/receipts/[id].
// Label left, value right: no dotted leaders (one-sided dotted borders
// draw solid on iOS).

import { useState } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SymbolView } from "expo-symbols";
import type { MobileReceipt, MobileReceiptDetail } from "@/lib/mobile/types";
import { fill, locale, s } from "../i18n";
import { formatMoney, longDate, parseReceiptDate } from "../lib/format";
import { getMerchantColor, getMerchantInitials } from "../lib/merchant";
import { fonts, radius, space, makeStyles, useColors } from "../theme";
import { Wordmark } from "./Brand";
import { Money } from "./Money";
import { PerfEdge } from "./PerfEdge";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export type EditableField = "merchant" | "amount" | "date" | "category";

const TOOTH = 10;

/** The torn bottom: the card's colour in teeth, a hairline along them. */
function TornEdge({ card, line }: { card: string; line: string }) {
  const [width, setWidth] = useState(0);
  const teeth = Math.max(1, Math.round(width / TOOTH));
  const w = width / teeth;
  let d = `M0 0`;
  for (let i = 0; i < teeth; i++) d += ` L${i * w + w / 2} 6 L${(i + 1) * w} 0`;
  return (
    <View style={{ height: 7 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {width > 0 ? (
        <Svg width={width} height={7}>
          <Path d={`${d} Z`} fill={card} />
          <Path d={d} fill="none" stroke={line} strokeWidth={1} />
        </Svg>
      ) : null}
    </View>
  );
}

function Rule() {
  const styles = useStyles();
  return <View style={styles.rule} />;
}

/** A receipt line: label left in muted ink, value right (mono for money). */
function Line({ label, value, mono = false, wrap = false }: { label: string; value: string; mono?: boolean; wrap?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color={colors.inkMuted} style={wrap ? styles.lineLabelWrap : styles.lineLabel}>
        {label}
      </Text>
      <Text variant={mono ? "amountRow" : "caption"} color={colors.ink} style={styles.lineValue}>
        {value}
      </Text>
    </View>
  );
}

function Stamp({ stamp }: { stamp: MobileReceiptDetail["stamp"] }) {
  const styles = useStyles();
  const colors = useColors();
  if (stamp === "verified" || stamp === "verified_edited") {
    return (
      <View style={styles.stamp}>
        <SymbolView name="checkmark" size={12} weight="heavy" tintColor={colors.brandAction} />
        <Text style={styles.stampText} color={colors.brandAction}>
          {stamp === "verified" ? s.detail.stampVerified : s.detail.stampVerifiedEdited}
        </Text>
      </View>
    );
  }
  const text = { review: s.detail.stampReview, checked: s.detail.stampChecked, automatic: s.detail.stampAutomatic }[stamp];
  return (
    <Text variant="caption" style={styles.footerText} color={stamp === "review" ? colors.attentionDeep : colors.inkMuted}>
      {text}
    </Text>
  );
}

export function DigitalReceipt({
  receipt: r,
  detail: d,
  onEdit,
}: {
  receipt: MobileReceipt;
  detail: MobileReceiptDetail | null;
  onEdit: (field: EditableField) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const money = (n: number) => formatMoney(n, r.currency, locale);
  const date = parseReceiptDate(r.date);
  const when = [
    date ? longDate(date, locale) : null,
    d?.time ?? null,
    d?.cardLastFour ? fill(s.detail.card, { last4: d.cardLastFour }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const converted =
    r.homeCurrency && r.homeCurrency !== r.currency && r.homeTotal != null
      ? {
          amount: formatMoney(r.homeTotal, r.homeCurrency, locale),
          source:
            r.fxSource === "manual"
              ? s.detail.bankAmount
              : d?.fxDate
                ? fill(s.detail.ecbRateOf, { date: longDate(parseReceiptDate(d.fxDate) ?? new Date(), locale) })
                : s.detail.ecbEstimate,
        }
      : null;
  const hasMeta = d && (d.paymentMethod || d.transactionRef || d.sellerOrgNumber || d.merchantVatNumber);

  return (
    <View>
      <PerfEdge color={colors.card} background={colors.surface} />
      <View style={styles.paper}>
        <View style={styles.head}>
          <Wordmark size={17} />
          <Text variant="micro" color={colors.inkMuted}>
            {s.detail.digitalReceipt}
            {d?.receiptNumber ? ` · ${fill(s.detail.number, { number: d.receiptNumber })}` : ""}
          </Text>
        </View>

        <PressableScale
          scaleTo={0.985}
          onPress={() => onEdit("merchant")}
          accessibilityRole="button"
          accessibilityLabel={`${s.edit.merchant}: ${r.merchant ?? s.edit.addMerchant}`}
          style={styles.merchantRow}
        >
          <View style={[styles.badge, { backgroundColor: getMerchantColor(r.merchant) }]}>
            <Text style={styles.badgeText} color={colors.white}>
              {getMerchantInitials(r.merchant)}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="bodyLg" style={styles.merchantName} numberOfLines={2} color={r.merchant ? colors.ink : colors.negative}>
              {r.merchant ?? s.edit.addMerchant}
            </Text>
            {d?.merchantAddress ? (
              <Text variant="caption" color={colors.inkMuted} numberOfLines={2}>
                {d.merchantAddress}
              </Text>
            ) : null}
          </View>
        </PressableScale>

        <View style={styles.tags}>
          <PressableScale
            scaleTo={0.96}
            onPress={() => onEdit("category")}
            accessibilityRole="button"
            accessibilityLabel={`${s.edit.category}: ${s.categories[r.category]}`}
            style={styles.tag}
          >
            <Text variant="caption" color={colors.ink}>
              {s.categories[r.category]}
            </Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            onPress={() => onEdit("date")}
            accessibilityRole="button"
            accessibilityLabel={`${s.edit.date}: ${when || s.edit.addDate}`}
            style={styles.tag}
          >
            <Text variant="caption" style={styles.tabular} color={date ? colors.ink : colors.negative}>
              {when || s.edit.addDate}
            </Text>
          </PressableScale>
        </View>

        {d && d.items.length > 0 ? (
          <>
            <Rule />
            <View style={styles.block} accessibilityLabel={s.detail.items}>
              {d.items.map((item, i) => (
                <Line
                  key={i}
                  wrap
                  mono
                  label={
                    item.qty != null && item.qty !== 1
                      ? `${item.label} × ${item.qty}${item.unitAmount != null ? ` @ ${money(item.unitAmount)}` : ""}`
                      : item.label
                  }
                  value={formatMoney(item.total, "XXX", locale).replace(/\s*XXX$/, "")}
                />
              ))}
            </View>
          </>
        ) : null}

        <Rule />
        {d && (d.subtotal != null || d.tip != null) ? (
          <View style={styles.block}>
            {d.subtotal != null ? <Line label={s.detail.subtotal} value={money(d.subtotal)} mono /> : null}
            {d.tip != null ? <Line label={s.detail.tip} value={money(d.tip)} mono /> : null}
          </View>
        ) : null}

        <PressableScale
          scaleTo={0.985}
          onPress={() => onEdit("amount")}
          accessibilityRole="button"
          accessibilityLabel={`${s.detail.total}: ${r.total != null ? money(r.total) : s.edit.addAmount}${converted ? `, ${converted.amount}` : ""}`}
          style={styles.totalRow}
        >
          <Text style={styles.totalLabel} color={colors.ink}>
            {s.detail.total}
          </Text>
          <View style={styles.flex} />
          {r.total != null ? (
            <Money amount={r.total} currency={r.currency} size="display" />
          ) : (
            <Text variant="bodyLg" color={colors.negative}>
              {s.edit.addAmount}
            </Text>
          )}
        </PressableScale>
        {converted ? (
          <View style={styles.block}>
            <Line label={fill(s.detail.inHomeCurrency, { currency: r.homeCurrency ?? "" })} value={`≈ ${converted.amount}`} mono />
            <Text variant="caption" color={colors.inkMuted} style={styles.right}>
              {converted.source}
            </Text>
          </View>
        ) : null}

        {d && d.vat != null ? (
          <View style={styles.block}>
            {d.vatLines.map((l, i) => (
              <Line key={`${l.rate}-${i}`} label={fill(s.detail.vatRate, { rate: l.rate })} value={money(l.vat)} mono />
            ))}
            <Line
              label={d.vatLines.length > 0 ? s.detail.vatTotal : d.vatRate != null ? fill(s.detail.vatRate, { rate: d.vatRate }) : s.detail.vat}
              value={money(d.vat)}
              mono
            />
            {d.net != null ? <Line label={s.detail.exclVat} value={money(d.net)} mono /> : null}
          </View>
        ) : null}

        {hasMeta ? (
          <>
            <Rule />
            <View style={styles.block}>
              {d.paymentMethod ? <Line label={s.detail.payment} value={d.paymentMethod} /> : null}
              {d.transactionRef ? <Line label={s.detail.transaction} value={d.transactionRef} /> : null}
              {d.sellerOrgNumber ? <Line label={s.detail.orgNumber} value={d.sellerOrgNumber} /> : null}
              {d.merchantVatNumber ? <Line label={s.detail.vatNumber} value={d.merchantVatNumber} /> : null}
            </View>
          </>
        ) : null}

        {r.notes ? (
          <>
            <Rule />
            <Text variant="micro" color={colors.inkMuted}>
              {s.detail.notes}
            </Text>
            <Text variant="body">{r.notes}</Text>
          </>
        ) : null}

        <Rule />
        <View style={styles.footer}>
          {d ? <Stamp stamp={d.stamp} /> : <View />}
          {r.original ? (
            <View style={styles.attached}>
              <SymbolView name="paperclip" size={12} weight="semibold" tintColor={colors.inkMuted} />
              <Text variant="caption" style={styles.footerText} color={colors.inkMuted}>
                {s.detail.originalAttached}
              </Text>
            </View>
          ) : (
            <Text variant="caption" style={styles.footerText} color={colors.inkMuted}>
              {s.detail.sources[r.source]}
            </Text>
          )}
        </View>
      </View>
      <TornEdge card={colors.card} line={colors.hairline} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  right: { textAlign: "right" },
  tabular: { fontVariant: ["tabular-nums"] },
  // DESIGN.md "Digital receipt": paper, a hairline border, no radius, no shadow.
  paper: {
    backgroundColor: colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  head: { alignItems: "center", gap: 2, marginBottom: space.sm },
  merchantRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 },
  badge: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.bold, fontSize: 17 },
  merchantName: { fontFamily: fonts.bold },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tag: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  rule: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: colors.hairline, marginVertical: space.xs },
  block: { gap: 4 },
  line: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
  lineLabel: { flexShrink: 0, fontFamily: fonts.semibold },
  lineLabelWrap: { flex: 1, fontFamily: fonts.semibold },
  lineValue: { flexShrink: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  totalRow: { flexDirection: "row", alignItems: "baseline", minHeight: 52, gap: space.sm },
  totalLabel: { fontFamily: fonts.extrabold, fontSize: 14, letterSpacing: 0.56, textTransform: "uppercase" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: 32 },
  footerText: { fontFamily: fonts.semibold },
  stamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 2,
    borderColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    transform: [{ rotate: "-6deg" }],
  },
  stampText: { fontFamily: fonts.extrabold, fontSize: 12, letterSpacing: 0.96, textTransform: "uppercase" },
  attached: { flexDirection: "row", alignItems: "center", gap: 4 },
}));
