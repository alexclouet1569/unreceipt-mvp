// Placeholders shaped like the list, breathing gently, for the very first
// load (after that the saved list shows at once).

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, space } from "../theme";

export function ReceiptSkeleton({ rows = 6 }: { rows?: number }) {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={pulse} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.label} />
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.block} />
          <View style={styles.middle}>
            <View style={[styles.line, { width: `${55 + ((i * 17) % 30)}%` }]} />
            <View style={[styles.line, styles.short]} />
          </View>
          <View style={[styles.line, styles.amount]} />
        </View>
      ))}
    </Animated.View>
  );
}

const GREY = "#EFEDE6";

const styles = StyleSheet.create({
  label: {
    width: 70,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREY,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    marginBottom: space.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  block: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: GREY },
  middle: { flex: 1, gap: 8 },
  line: { height: 11, borderRadius: 6, backgroundColor: GREY },
  short: { width: "40%" },
  amount: { width: 64 },
});
