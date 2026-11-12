// The website's three boxes above the receipts (dashboard.tsx StatCard and
// PeriodTotalCard): how many receipts, how many verified, and a month's
// total in the company's currency. The third box opens Apple's own
// pull-down menu (SwiftUI Menu through @expo/ui), anchored to the box, to
// pick another month or All time; the chosen one carries a tick.

import { useMemo } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Button as MenuItem, Host, Menu, Rectangle } from "@expo/ui/swift-ui";
import {
  accessibilityHint,
  accessibilityLabel,
  contentShape,
  foregroundStyle,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import type { MobileReceipt, OlderSummary } from "@/lib/mobile/types";
import { fill, locale, s } from "../i18n";
import { formatMoney } from "../lib/format";
import { overallCounts, periodTotals, periodsFor, type PeriodKey, type TotalLine } from "../lib/summary";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";
import { radius, space, makeStyles, useColors, useScheme } from "../theme";
import { Money } from "./Money";
import { Text } from "./Text";

function Box({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.box}>{children}</View>;
}

function Count({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  const colors = useColors();
  const scheme = useScheme();
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

  const choose = (p: (typeof periods)[number]) => {
    void Haptics.selectionAsync();
    onPeriod(p.key);
    AccessibilityInfo.announceForAccessibility(fill(s.summary.totalFor, { period: p.label }));
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
        <View style={styles.inner} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {totals.map((t) => (
            <TotalAmount key={t.currency} line={t} rolls={t.currency === homeCurrency} />
          ))}
          <View style={styles.period}>
            <Text variant="caption" color={colors.inkMuted} numberOfLines={1} style={styles.shrink}>
              {selected.short}
            </Text>
            <SymbolView name="chevron.up.chevron.down" size={10} weight="semibold" tintColor={colors.inkMuted} />
          </View>
        </View>
        {/* The menu's trigger covers the box (an almost clear shape: SwiftUI
            doesn't hit-test a fully clear one), so the menu grows from it. */}
        <Host style={StyleSheet.absoluteFill} colorScheme={scheme}>
          <Menu
            label={
              <Rectangle
                modifiers={[
                  foregroundStyle("#FFFFFF02"),
                  frame({ maxWidth: 10_000, maxHeight: 10_000 }),
                  contentShape(shapes.rectangle()),
                  accessibilityLabel(`${fill(s.summary.totalFor, { period: selected.label })}: ${spoken}`),
                  accessibilityHint(s.summary.periodHint),
                ]}
              />
            }
          >
            {periods.map((p) => (
              <MenuItem
                key={p.key}
                label={p.label}
                systemImage={p.key === selected.key ? "checkmark" : undefined}
                onPress={() => choose(p)}
              />
            ))}
          </Menu>
        </Host>
      </Box>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
