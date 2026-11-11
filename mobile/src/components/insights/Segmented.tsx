// A row of options on a cream track, the chosen one on a white thumb: the
// By date / By category switch (ViewToggle) for any number of options.

import { StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, fonts, radius, space } from "../../theme";
import { PressableScale } from "../PressableScale";
import { Text } from "../Text";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  /** Called on every tap, the chosen option included (Dates opens its sheet again). */
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <PressableScale
            key={o.value}
            scaleTo={0.97}
            onPress={() => {
              if (!active) void Haptics.selectionAsync();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={[styles.option, active && styles.active]}
          >
            <Text style={styles.label} color={active ? colors.ink : colors.inkMuted} numberOfLines={1} adjustsFontSizeToFit>
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
    marginTop: space.md,
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
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  active: { backgroundColor: colors.card, borderColor: colors.hairline },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
});
