import { ActivityIndicator, StyleSheet } from "react-native";
import { colors, fonts, radius } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  kind = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** ink: a filled button that isn't the screen's green action. outline: a hairline-bordered second choice. */
  kind?: "primary" | "ink" | "outline" | "plain" | "destructive";
}) {
  const inactive = disabled || busy;
  const primary = kind === "primary";
  const filled = primary || kind === "ink";
  return (
    <PressableScale
      accessibilityRole="button"
      // Named even while the spinner replaces the label.
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      haptic={filled}
      scaleTo={0.97}
      onPress={onPress}
      style={[
        styles.base,
        primary ? styles.primary : kind === "ink" ? styles.ink : kind === "outline" ? styles.outline : styles.plain,
        inactive && styles.inactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={filled ? colors.white : colors.ink} />
      ) : (
        <Text
          style={styles.label}
          color={
            filled
              ? colors.white
              : kind === "destructive"
                ? colors.negative
                : kind === "outline"
                  ? colors.ink
                  : colors.brandAction
          }
        >
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: colors.brandAction },
  ink: { backgroundColor: colors.ink },
  outline: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline },
  plain: { backgroundColor: "transparent" },
  inactive: { opacity: 0.45 },
  label: { fontFamily: fonts.bold, fontSize: 16 },
});
