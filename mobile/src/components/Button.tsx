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
  kind?: "primary" | "plain" | "destructive";
}) {
  const inactive = disabled || busy;
  const primary = kind === "primary";
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      haptic={primary}
      scaleTo={0.97}
      onPress={onPress}
      style={[
        styles.base,
        primary ? styles.primary : styles.plain,
        primary && inactive && styles.primaryInactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.white : colors.ink} />
      ) : (
        <Text
          style={styles.label}
          color={
            primary ? colors.white : kind === "destructive" ? colors.negative : colors.brandAction
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
  primaryInactive: { opacity: 0.45 },
  plain: { backgroundColor: "transparent" },
  label: { fontFamily: fonts.bold, fontSize: 16 },
});
