// The period of the list's search (the website's period menu next to the
// search field): a chip that opens Apple's own pull-down menu (SwiftUI Menu
// through @expo/ui, as the total box in StatCards) with Any time, a year per
// year when the receipts span more than one, then each month that has
// receipts. The chosen one carries a tick; the chip is ink-bordered while a
// period is chosen, like an active filter chip.

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
import { locale, s } from "../i18n";
import { ALL_TIME, periodsFor, receiptMonthKey } from "../lib/summary";
import { fonts, radius, space, makeStyles, useColors, useScheme } from "../theme";
import { Text } from "./Text";

export function SearchPeriod({
  receipts,
  older,
  period,
  onChange,
}: {
  receipts: MobileReceipt[];
  older?: OlderSummary;
  /** "" (any time), a year ("2026") or a month ("2026-11"). */
  period: string;
  onChange: (period: string) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const scheme = useScheme();
  const options = useMemo(() => {
    // Only months that have receipts (the total box also offers this month).
    const used = new Set(Object.keys(older?.months ?? {}));
    for (const r of receipts) {
      const k = receiptMonthKey(r);
      if (k) used.add(k);
    }
    const months = periodsFor(receipts, locale, "", new Date(), [...used]).filter(
      (p) => p.key !== ALL_TIME && used.has(p.key),
    );
    const years = [...new Set(months.map((m) => m.key.slice(0, 4)))];
    return [
      { key: "", label: s.search.anyTime },
      ...(years.length > 1 ? years.map((y) => ({ key: y, label: y })) : []),
      ...months.map((m) => ({ key: m.key, label: m.label })),
    ];
  }, [receipts, older]);
  const selected = options.find((o) => o.key === period) ?? options[0];
  const active = selected.key !== "";

  const choose = (key: string, label: string) => {
    void Haptics.selectionAsync();
    onChange(key);
    AccessibilityInfo.announceForAccessibility(`${s.search.period}: ${label}`);
  };

  return (
    <View style={styles.target}>
      <View
        style={[styles.chip, active && styles.active]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <SymbolView name="calendar" size={14} tintColor={active ? colors.ink : colors.inkMuted} />
        <Text style={styles.label} color={active ? colors.ink : colors.inkMuted} numberOfLines={1}>
          {selected.label}
        </Text>
        <SymbolView name="chevron.up.chevron.down" size={10} weight="semibold" tintColor={colors.inkMuted} />
      </View>
      {/* An almost clear trigger over the chip, so the menu grows from it. */}
      <Host style={StyleSheet.absoluteFill} colorScheme={scheme}>
        <Menu
          label={
            <Rectangle
              modifiers={[
                foregroundStyle("#FFFFFF02"),
                frame({ maxWidth: 10_000, maxHeight: 10_000 }),
                contentShape(shapes.rectangle()),
                accessibilityLabel(`${s.search.period}: ${selected.label}`),
                accessibilityHint(s.search.periodHint),
              ]}
            />
          }
        >
          {options.map((o) => (
            <MenuItem
              key={o.key || "any"}
              label={o.label}
              systemImage={o.key === selected.key ? "checkmark" : undefined}
              onPress={() => choose(o.key, o.label)}
            />
          ))}
        </Menu>
      </Host>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  target: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", marginHorizontal: space.lg, marginTop: space.sm },
  chip: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  active: { backgroundColor: colors.card, borderColor: colors.ink },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
}));
