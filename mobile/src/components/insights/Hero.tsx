// The top of the Analysis screen: what was spent and how many receipts,
// side by side and the same size (DESIGN.md "Charts and Analysis"); under
// them, only when it applies, what the total still waits for or leaves out,
// each opening its receipts. No comparison with earlier periods: the arrows
// and a sideways swipe show them.

import { View } from "react-native";
import { SymbolView } from "expo-symbols";
import { fill, locale, s } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { fillParts, plural, type Part, type ReadyAnalytics } from "../../lib/insights";
import { useAnimatedNumber } from "../../lib/useAnimatedNumber";
import { fonts, radius, space, makeStyles, useColors } from "../../theme";
import { figureSize, Money } from "../Money";
import { PressableScale } from "../PressableScale";
import { Text } from "../Text";
import { Parts } from "./Parts";

export type SummaryFilter = "to_confirm" | "missing_amount" | "unconverted";

/** The period's two figures and what they wait for; each opens the receipts behind it. */
export function Hero({
  a,
  onOpen,
  onFilter,
}: {
  a: ReadyAnalytics;
  onOpen: () => void;
  onFilter: (which: SummaryFilter) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const shown = useAnimatedNumber(a.total.amount);
  const count = useAnimatedNumber(a.total.count);
  const total = formatMoney(a.total.amount, a.currency, locale);
  const receipts = plural(a.total.count, s.insights.receiptsOne, s.insights.receiptsOther);
  // One size for both figures, from the amount as shown ("≈" included).
  const px = figureSize(`${a.total.estimate ? "≈" : ""}${total.replace(/\s/g, " ")}`);
  const unconverted = a.total.unconverted.map((l) => formatMoney(l.amount, l.currency, locale)).join(s.receipts.totalJoin);

  const notes: { key: SummaryFilter; parts: Part[] }[] = [];
  if (a.total.toConfirm > 0) {
    notes.push({ key: "to_confirm", parts: [{ text: plural(a.total.toConfirm, s.insights.toConfirmOne, s.insights.toConfirmOther) }] });
  }
  if (a.quality.missingAmount > 0) {
    notes.push({
      key: "missing_amount",
      parts: [{ text: plural(a.quality.missingAmount, s.insights.qualityMissingOne, s.insights.qualityMissingOther) }],
    });
  }
  if (unconverted) notes.push({ key: "unconverted", parts: fillParts(s.insights.notConverted, {}, { amounts: unconverted }) });

  return (
    <View style={styles.card}>
      <View style={styles.figures}>
        <PressableScale
          scaleTo={0.985}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${s.insights.spent}: ${a.total.estimate ? fill(s.summary.about, { amount: total }) : total}`}
          accessibilityHint={s.insights.openHint}
          style={styles.figure}
        >
          <Text variant="micro" color={colors.inkMuted}>
            {s.insights.spent}
          </Text>
          <View style={styles.value}>
            {a.total.estimate ? (
              <Text style={[styles.approx, { fontSize: px, lineHeight: px * 1.05 }]} color={colors.inkMuted} maxFontSizeMultiplier={1.1}>
                {s.receipts.approx}
              </Text>
            ) : null}
            <Money amount={shown} currency={a.currency} size="figure" figurePx={px} />
          </View>
        </PressableScale>
        <View style={styles.rule} />
        <PressableScale
          scaleTo={0.985}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={receipts}
          accessibilityHint={s.insights.openHint}
          style={styles.figure}
        >
          <Text variant="micro" color={colors.inkMuted}>
            {s.insights.receiptsLabel}
          </Text>
          {/* A count is not money: Manrope, the same size as the amount beside it. */}
          <Text
            style={[styles.count, { fontSize: px, lineHeight: px * 1.08, letterSpacing: -0.02 * px }]}
            color={colors.ink}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
          >
            {String(Math.round(count))}
          </Text>
        </PressableScale>
      </View>
      {notes.map((n) => (
        <PressableScale
          key={n.key}
          scaleTo={0.99}
          onPress={() => onFilter(n.key)}
          accessibilityRole="button"
          accessibilityLabel={n.parts.map((p) => p.text).join("")}
          style={styles.note}
        >
          <Parts parts={n.parts} color={colors.ink} style={styles.noteText} />
          <SymbolView name="chevron.right" size={12} weight="semibold" tintColor={colors.inkFaint} />
        </PressableScale>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  figures: { flexDirection: "row" },
  figure: { flex: 1, minHeight: 96, justifyContent: "center", gap: space.xs, paddingHorizontal: space.lg, paddingVertical: 14 },
  rule: { width: 1, backgroundColor: colors.hairline },
  value: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  approx: { fontFamily: fonts.mono },
  count: { fontFamily: fonts.bold },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  noteText: { flex: 1 },
}));
