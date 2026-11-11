// The category filter under the summary (DESIGN.md "Group and filter"):
// All, then each category that has receipts, most used first. A row that
// scrolls sideways; a 36 pt pill inside a 44 pt target; active = white with
// an ink border. Tapping the active category again goes back to All.

import { ScrollView, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { ReceiptCategory } from "@/lib/types";
import { s } from "../i18n";
import type { CategoryCount } from "../lib/summary";
import { colors, fonts, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

function Chip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.94}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}`}
      style={styles.target}
    >
      <View style={[styles.chip, active && styles.active]}>
        <Text style={styles.label} color={active ? colors.ink : colors.inkMuted} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.label, styles.count]} color={colors.inkMuted}>
          {count}
        </Text>
      </View>
    </PressableScale>
  );
}

export function CategoryChips({
  counts,
  total,
  selected,
  onSelect,
}: {
  counts: CategoryCount[];
  total: number;
  selected: ReceiptCategory | null;
  onSelect: (category: ReceiptCategory | null) => void;
}) {
  // One category only: a filter would show the same list.
  if (counts.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={s.summary.filterLabel}
      style={styles.scroller}
    >
      <Chip label={s.summary.filterAll} count={total} active={selected == null} onPress={() => onSelect(null)} />
      {counts.map((c) => (
        <Chip
          key={c.key}
          label={s.categories[c.key]}
          count={c.count}
          active={selected === c.key}
          onPress={() => onSelect(selected === c.key ? null : c.key)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { marginTop: space.sm, flexGrow: 0 },
  row: { paddingHorizontal: space.lg, gap: space.xs },
  target: { minHeight: 44, justifyContent: "center" },
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
  count: { fontVariant: ["tabular-nums"] },
});
