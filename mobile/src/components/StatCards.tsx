// The website's three boxes above the receipts (dashboard.tsx StatCard and
// PeriodTotalCard): how many receipts, how many verified, and a month's
// total in the company's currency. The third box is a button: iOS's own
// action sheet picks another month or All time.

import { useMemo } from "react";
import { AccessibilityInfo, ActionSheetIOS, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import type { MobileReceipt, OlderSummary } from "@/lib/mobile/types";
import { fill, locale, s } from "../i18n";
import { formatMoney } from "../lib/format";
import { overallCounts, periodTotals, periodsFor, type PeriodKey, type TotalLine } from "../lib/summary";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";
import { colors, radius, space } from "../theme";
import { Money } from "./Money";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

function Box({ children }: { children: React.ReactNode }) {
  return <View style={styles.box}>{children}</View>;
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <Box>
      <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.inner}>
        <Text variant="bodyLg" style={styles.number}>
          {value}
        </Text>
        <Text variant="caption" color={colors.inkMuted} numberOfLines={2} style={styles.center}>
          {label}
        </Text>
      </View>
    </Box>
  );
}

/** One line of the total; the company's currency rolls to a new value. */
function TotalAmount({ line, rolls }: { line: TotalLine; rolls: boolean }) {
  const animated = useAnimatedNumber(line.amount);
  return (
    <View style={styles.total}>
      {line.estimate ? (
        <Text variant="amountRow" color={colors.inkMuted} maxFontSizeMultiplier={1.2}>
          {s.receipts.approx}
        </Text>
      ) : null}
      <Money amount={rolls ? animated : line.amount} currency={line.currency} size="row" fit />
    </View>
  );
}

export function StatCards({
  receipts,
  older,
  homeCurrency,
  period,
  onPeriod,
}: {
  receipts: MobileReceipt[];
  /** Everything beyond the list, summed by the server (missing on old servers). */
  older?: OlderSummary;
  homeCurrency: string;
  period: PeriodKey;
  onPeriod: (period: PeriodKey) => void;
}) {
  const periods = useMemo(
    () => periodsFor(receipts, locale, s.summary.allTime, new Date(), Object.keys(older?.months ?? {})),
    [receipts, older],
  );
  const selected = periods.find((p) => p.key === period) ?? periods[0];
  const totals = useMemo(
    () => periodTotals(receipts, older, selected.key, homeCurrency),
    [receipts, older, selected.key, homeCurrency],
  );
  const { count, verified } = useMemo(() => overallCounts(receipts, older), [receipts, older]);

  const choose = () => {
    void Haptics.selectionAsync();
    const options = [...periods.map((p) => p.label), s.common.cancel];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: s.summary.choosePeriod, options, cancelButtonIndex: options.length - 1, tintColor: colors.ink },
      (index) => {
        const p = periods[index];
        if (!p) return;
        onPeriod(p.key);
        AccessibilityInfo.announceForAccessibility(fill(s.summary.totalFor, { period: p.label }));
      },
    );
  };

  const spoken = totals
    .map((t) => {
      const money = formatMoney(t.amount, t.currency, locale);
      return t.estimate ? fill(s.summary.about, { amount: money }) : money;
    })
    .join(" + ");

  return (
    <View style={styles.row}>
      <Count value={count} label={s.summary.statReceipts} />
      <Count value={verified} label={s.summary.statVerified} />
      <Box>
        <PressableScale
          scaleTo={0.97}
          onPress={choose}
          accessibilityRole="button"
          accessibilityLabel={`${fill(s.summary.totalFor, { period: selected.label })}: ${spoken}`}
          accessibilityHint={s.summary.periodHint}
          style={styles.inner}
        >
          {totals.map((t) => (
            <TotalAmount key={t.currency} line={t} rolls={t.currency === homeCurrency} />
          ))}
          <View style={styles.period}>
            <Text variant="caption" color={colors.inkMuted} numberOfLines={1} style={styles.shrink}>
              {selected.short}
            </Text>
            <SymbolView name="chevron.down" size={10} weight="semibold" tintColor={colors.inkMuted} />
          </View>
        </PressableScale>
      </Box>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md, marginHorizontal: space.lg, marginTop: space.lg },
  box: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  inner: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", paddingVertical: space.md, paddingHorizontal: space.sm, gap: 2 },
  number: { fontVariant: ["tabular-nums"] },
  total: { flexDirection: "row", alignItems: "baseline", maxWidth: "100%" },
  period: { flexDirection: "row", alignItems: "center", gap: 3, maxWidth: "100%" },
  shrink: { flexShrink: 1 },
  center: { textAlign: "center" },
});
