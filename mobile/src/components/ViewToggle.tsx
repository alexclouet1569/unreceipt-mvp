// "By date / By category", the website's two-option switch (DESIGN.md
// "Group and filter"): a cream track, the chosen option on a white thumb,
// 44 pt buttons.

import { StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { s } from "../i18n";
import { colors, fonts, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export type ListView = "date" | "category";

export function ViewToggle({ view, onChange }: { view: ListView; onChange: (v: ListView) => void }) {
  const options: { value: ListView; label: string }[] = [
    { value: "date", label: s.summary.byDate },
    { value: "category", label: s.summary.byCategory },
  ];
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={s.summary.groupLabel}>
      {options.map((o) => {
        const active = view === o.value;
        return (
          <PressableScale
            key={o.value}
            scaleTo={0.97}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={[styles.option, active && styles.active]}
          >
            <Text style={styles.label} color={active ? colors.ink : colors.inkMuted}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginTop: space.lg,
    padding: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  option: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  active: { backgroundColor: colors.card, borderColor: colors.hairline },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
});
