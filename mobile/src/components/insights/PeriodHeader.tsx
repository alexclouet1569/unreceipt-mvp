// ‹ November 2026 › — the period shown, with the one before and after.

import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { s } from "../../i18n";
import { colors, space } from "../../theme";
import { PressableScale } from "../PressableScale";
import { Text } from "../Text";

function Arrow({ dir, onPress }: { dir: "left" | "right"; onPress: (() => void) | null }) {
  return (
    <PressableScale
      scaleTo={0.9}
      disabled={!onPress}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={dir === "left" ? s.insights.previous : s.insights.next}
      accessibilityState={{ disabled: !onPress }}
      hitSlop={6}
      style={styles.arrow}
    >
      <SymbolView
        name={dir === "left" ? "chevron.left" : "chevron.right"}
        size={17}
        weight="semibold"
        tintColor={onPress ? colors.ink : colors.inkFaint}
      />
    </PressableScale>
  );
}

export function PeriodHeader({
  title,
  onPrevious,
  onNext,
}: {
  title: string;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}) {
  return (
    <View style={styles.row}>
      <Arrow dir="left" onPress={onPrevious} />
      <Text variant="bodyLg" style={styles.title} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
        {title}
      </Text>
      <Arrow dir="right" onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginHorizontal: space.sm, marginTop: space.lg },
  title: { flex: 1, textAlign: "center" },
  arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
