// The chips above the list (DESIGN.md "Group and filter", as on the
// website): All, To confirm, then each category that has receipts, most
// used first. A row that scrolls sideways; a 36 pt pill inside a 44 pt
// target; active = white with an ink border (honey for To confirm).
// Tapping the active chip again goes back to All.

import { ScrollView, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { s } from "../i18n";
import type { CategoryCount, ListFilter } from "../lib/summary";
import { colors, fonts, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

function Chip({
  label,
  count,
  active,
  attention = false,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  attention?: boolean;
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
      accessibilityHint={s.summary.filterHint}
      style={styles.target}
    >
      <View style={[styles.chip, active && (attention ? styles.activeAttention : styles.active)]}>
        <Text style={styles.label} color={active ? colors.ink : colors.inkMuted} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.label, styles.count]} color={attention ? colors.attentionDeep : colors.inkMuted}>
          {count}
        </Text>
      </View>
    </PressableScale>
  );
}

export function CategoryChips({
  counts,
  total,
  toConfirm,
  selected,
  onSelect,
}: {
  counts: CategoryCount[];
  total: number;
  toConfirm: number;
  selected: ListFilter;
  onSelect: (filter: ListFilter) => void;
}) {
  // Nothing to filter: every chip would show the same list.
  if (counts.length < 2 && toConfirm === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroller}
    >
      <Chip label={s.summary.filterAll} count={total} active={selected === "all"} onPress={() => onSelect("all")} />
      {toConfirm > 0 ? (
        <Chip
          label={s.receipts.toConfirm}
          count={toConfirm}
          attention
          active={selected === "review"}
          onPress={() => onSelect(selected === "review" ? "all" : "review")}
        />
      ) : null}
      {counts.map((c) => (
        <Chip
          key={c.key}
          label={s.categories[c.key]}
          count={c.count}
          active={selected === c.key}
          onPress={() => onSelect(selected === c.key ? "all" : c.key)}
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
  activeAttention: { backgroundColor: colors.card, borderColor: colors.attention },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
  count: { fontVariant: ["tabular-nums"] },
});
