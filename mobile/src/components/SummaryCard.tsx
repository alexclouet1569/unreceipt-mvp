// The top of the receipts list: a month's total in the company's currency
// (the month switches with iOS's own action sheet), how many receipts it
// holds and how many of them are complete. What still needs the user is
// counted once, by the "To confirm" section and the tab badge, so this card
// shows no second honey number. Compact on purpose: one card, so the
// receipts start high on the screen.

import { useMemo } from "react";
import { ActionSheetIOS, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import type { MobileReceipt } from "@/lib/mobile/types";
import { fill, locale, s } from "../i18n";
import { formatMoney } from "../lib/format";
import { inPeriod, periodsFor, totalsFor, type PeriodKey } from "../lib/summary";
import { colors, radius, space } from "../theme";
import { Money } from "./Money";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function SummaryCard({
  receipts,
  allReceipts,
  homeCurrency,
  period,
  onPeriod,
}: {
  /** The receipts the list shows (after the category filter). */
  receipts: MobileReceipt[];
  /** Every receipt, so the month list doesn't change with the filter. */
  allReceipts: MobileReceipt[];
  homeCurrency: string;
  period: PeriodKey;
  onPeriod: (period: PeriodKey) => void;
}) {
  const periods = useMemo(() => periodsFor(allReceipts, locale, s.summary.allTime), [allReceipts]);
  const selected = periods.find((p) => p.key === period) ?? periods[0];
  const shown = useMemo(() => inPeriod(receipts, selected.key), [receipts, selected.key]);
  const totals = useMemo(() => totalsFor(shown, homeCurrency), [shown, homeCurrency]);
  const complete = shown.filter((r) => r.status === "verified").length;
  const count = shown.length === 1 ? s.summary.receiptOne : fill(s.summary.receiptMany, { count: shown.length });

  const choose = () => {
    void Haptics.selectionAsync();
    const options = [...periods.map((p) => p.label), s.common.cancel];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: s.summary.choosePeriod, options, cancelButtonIndex: options.length - 1, tintColor: colors.ink },
      (index) => {
        const p = periods[index];
        if (p) onPeriod(p.key);
      },
    );
  };

  // "Total for November: 4 512,50 kr, 12 receipts, 3 to confirm".
  const spoken = totals
    .map((t) => {
      const money = formatMoney(t.amount, t.currency, locale);
      return t.estimate ? fill(s.summary.about, { amount: money }) : money;
    })
    .join(" + ");

  return (
    <View style={styles.card}>
      <PressableScale
        scaleTo={0.97}
        onPress={choose}
        accessibilityRole="button"
        accessibilityLabel={`${fill(s.summary.totalFor, { period: selected.label })}: ${spoken}`}
        accessibilityHint={s.summary.periodHint}
        hitSlop={8}
        style={styles.left}
      >
        <View style={styles.periodRow}>
          <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {selected.label}
          </Text>
          <SymbolView name="chevron.down" size={11} weight="semibold" tintColor={colors.inkMuted} />
        </View>
        {totals.map((t) => (
          <View key={t.currency} style={styles.totalRow}>
            {t.estimate ? (
              <Text variant="amountXl" color={colors.inkMuted}>
                {"≈ "}
              </Text>
            ) : null}
            <Money amount={t.amount} currency={t.currency} />
          </View>
        ))}
      </PressableScale>
      <View
        style={styles.right}
        accessible
        accessibilityLabel={shown.length > 0 ? `${count}, ${fill(s.summary.complete, { count: complete })}` : count}
      >
        <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {count}
        </Text>
        {shown.length > 0 ? (
          <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {fill(s.summary.complete, { count: complete })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    marginHorizontal: space.lg,
    marginTop: space.md,
  },
  left: { flexShrink: 1, gap: 4, minHeight: 44, justifyContent: "flex-end" },
  periodRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  totalRow: { flexDirection: "row", alignItems: "baseline" },
  right: { alignItems: "flex-end", gap: 2, flexShrink: 0, maxWidth: "45%" },
});
