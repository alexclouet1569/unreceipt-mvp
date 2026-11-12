// The period's total, large in mono, rolling to each new value; under it
// the change against the period before and last year (neutral ink: more
// spending isn't "bad"), and what the total includes or leaves out.

import { StyleSheet, View } from "react-native";
import { fill, locale, s } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { changeText, fillParts, plural, previousLabel, type ReadyAnalytics } from "../../lib/insights";
import { useAnimatedNumber } from "../../lib/useAnimatedNumber";
import { colors, radius, space } from "../../theme";
import { Money } from "../Money";
import { PressableScale } from "../PressableScale";
import { Text } from "../Text";
import { Parts } from "./Parts";

function Chip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text variant="caption" color={colors.ink} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

/** The total, its comparisons and what it includes; tapping it opens the period's receipts. */
export function Hero({ a, onOpen }: { a: ReadyAnalytics; onOpen: () => void }) {
  const shown = useAnimatedNumber(a.total.amount);
  const vsPrevious = changeText(a.total.amount, a.compare.previous, locale);
  const vsLastYear = changeText(a.total.amount, a.compare.lastYear, locale);
  const unconverted = a.total.unconverted.map((l) => formatMoney(l.amount, l.currency, locale)).join(s.receipts.totalJoin);
  const spoken = `${s.insights.spent}: ${a.total.estimate ? fill(s.summary.about, { amount: formatMoney(a.total.amount, a.currency, locale) }) : formatMoney(a.total.amount, a.currency, locale)}`;

  return (
    <View style={styles.hero}>
      <Text variant="micro" color={colors.inkMuted}>
        {s.insights.spent}
      </Text>
      <PressableScale
        scaleTo={0.985}
        disabled={a.total.count === 0}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        style={styles.amount}
      >
        {a.total.estimate ? (
          <Text variant="amountDisplay" color={colors.inkMuted} style={styles.approx} maxFontSizeMultiplier={1.1}>
            {s.receipts.approx}
          </Text>
        ) : null}
        {/* The size follows the final value, so it doesn't jump mid-roll. */}
        <Money amount={shown} currency={a.currency} size="display" sizeFor={a.total.amount} />
      </PressableScale>
      {vsPrevious || vsLastYear ? (
        <View style={styles.chips}>
          {vsPrevious ? <Chip text={fill(s.insights.vs, { change: vsPrevious, period: previousLabel(a, locale, s) })} /> : null}
          {vsLastYear && a.period.kind !== "year" ? <Chip text={fill(s.insights.vsLastYear, { change: vsLastYear })} /> : null}
        </View>
      ) : null}
      <Text variant="caption" color={colors.inkMuted} style={styles.meta}>
        {plural(a.total.count, s.insights.receiptsOne, s.insights.receiptsOther)}
        {a.total.toConfirm > 0 ? ` · ${plural(a.total.toConfirm, s.insights.toConfirmOne, s.insights.toConfirmOther)}` : ""}
      </Text>
      {unconverted ? <Parts parts={fillParts(s.insights.notConverted, {}, { amounts: unconverted })} amountColor={colors.inkMuted} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: space.lg, marginTop: space.lg, gap: space.xs },
  amount: { flexDirection: "row", alignItems: "baseline" },
  approx: { fontSize: 26 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  chip: {
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  meta: { marginTop: space.xs },
});
