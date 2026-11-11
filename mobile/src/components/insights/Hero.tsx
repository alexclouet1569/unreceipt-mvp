// The period's total, large in mono, rolling to each new value; under it
// the change against the period before and last year (neutral ink: more
// spending isn't "bad"), and what the total includes or leaves out.

import { StyleSheet, View } from "react-native";
import { fill, locale, s } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { changeText, plural, previousLabel, type ReadyAnalytics } from "../../lib/insights";
import { useAnimatedNumber } from "../../lib/useAnimatedNumber";
import { colors, radius, space } from "../../theme";
import { Money } from "../Money";
import { Text } from "../Text";

function Chip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text variant="caption" color={colors.ink} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function Hero({ a }: { a: ReadyAnalytics }) {
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
      <View style={styles.amount} accessible accessibilityLabel={spoken} accessibilityLiveRegion="polite">
        {a.total.estimate ? (
          <Text variant="amountDisplay" color={colors.inkMuted} style={styles.approx} maxFontSizeMultiplier={1.1}>
            {s.receipts.approx}
          </Text>
        ) : null}
        <Money amount={shown} currency={a.currency} size="display" />
      </View>
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
      {unconverted ? (
        <Text variant="caption" color={colors.inkMuted}>
          {fill(s.insights.notConverted, { amounts: unconverted })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: space.lg, marginTop: space.lg, gap: space.xs },
  amount: { flexDirection: "row", alignItems: "baseline" },
  approx: { fontSize: 26 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  meta: { marginTop: space.xs },
});
