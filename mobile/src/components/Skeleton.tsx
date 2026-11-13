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
import { durations, radius, space, makeStyles } from "../theme";

/** The gentle 480 ms breathing every placeholder shares. */
export function useBreathing() {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: durations.long, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/**
 * Settings-style groups (the Account tab) before anything is known. bare:
 * the card(s) only, under a section title that is already there.
 */
export function GroupedSkeleton({ groups = [2, 3, 1], bare = false }: { groups?: number[]; bare?: boolean }) {
  const styles = useStyles();
  const pulse = useBreathing();
  return (
    <Animated.View style={pulse} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {groups.map((rows, g) => (
        <View key={g} style={bare ? undefined : styles.group}>
          {bare ? null : <View style={[styles.label, styles.groupLabel]} />}
          <View style={styles.groupCard}>
            {Array.from({ length: rows }, (_, i) => (
              <View key={i} style={[styles.groupRow, i > 0 && styles.groupDivider]}>
                <View style={[styles.line, { width: `${40 + ((i * 23 + g * 11) % 35)}%` }]} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * Text lines and button shapes where a screen's actions will be, while
 * what they offer is still unknown (never a button that changes under the
 * finger). lines: body text lines; buttons: 52 pt button shapes; card: the
 * address card under them.
 */
export function ActionsSkeleton({ lines = 2, buttons = 1, card = false }: { lines?: number; buttons?: number; card?: boolean }) {
  const styles = useStyles();
  const pulse = useBreathing();
  return (
    <Animated.View
      style={[pulse, styles.actions]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: lines }, (_, i) => (
        <View key={`l${i}`} style={[styles.line, styles.centerLine, { width: i === lines - 1 ? "60%" : "90%" }]} />
      ))}
      <View style={styles.actionGap} />
      {Array.from({ length: buttons }, (_, i) => (
        <View key={`b${i}`} style={styles.button} />
      ))}
      {card ? <View style={styles.cardShape} /> : null}
    </Animated.View>
  );
}

export function ReceiptSkeleton({ rows = 6 }: { rows?: number }) {
  const styles = useStyles();
  const pulse = useBreathing();

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

const useStyles = makeStyles((colors) => ({
  label: {
    width: 70,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.skeleton,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    marginBottom: space.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  block: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.skeleton },
  middle: { flex: 1, gap: 8 },
  line: { height: 11, borderRadius: 6, backgroundColor: colors.skeleton },
  short: { width: "40%" },
  amount: { width: 64 },
  group: { marginTop: space.lg },
  groupLabel: { marginHorizontal: 0, marginTop: 0, marginBottom: space.sm },
  groupCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  groupRow: { minHeight: 52, justifyContent: "center", paddingHorizontal: space.lg },
  groupDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  actions: { alignSelf: "stretch", gap: space.sm },
  centerLine: { alignSelf: "center" },
  actionGap: { height: space.sm },
  button: { height: 52, borderRadius: radius.md, backgroundColor: colors.skeleton },
  cardShape: {
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginTop: space.sm,
  },
}));
