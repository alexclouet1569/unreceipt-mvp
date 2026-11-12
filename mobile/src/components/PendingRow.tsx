// A scan on its way: its own picture, "Reading your receipt…", then it turns
// into the receipt. Waiting offline says so calmly (a clock, no spinner); a
// picture the server refused, or that couldn't be sent after several tries,
// can be tried again or removed.

import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { s } from "../i18n";
import type { PendingScan } from "../lib/scans/queue";
import { durations, fonts, radius, space, makeStyles, useColors } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

function message(scan: PendingScan): string {
  switch (scan.state) {
    case "notReceipt":
      return s.scan.notReceipt;
    case "failed":
      return s.scan.failed;
    case "waiting":
      return scan.attempts > 0 ? s.scan.waiting : s.scan.reading;
    case "uploading":
      return s.scan.reading;
  }
}

function SmallButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <PressableScale
      scaleTo={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={styles.button}
    >
      <Text variant="caption" style={styles.buttonLabel} color={color} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function PendingRow({
  scan,
  onRemove,
  onRetry,
}: {
  scan: PendingScan;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const stuck = scan.state === "notReceipt" || scan.state === "failed";
  const offline = scan.state === "waiting" && scan.attempts > 0;
  return (
    <Animated.View
      entering={FadeIn.duration(durations.medium)}
      exiting={FadeOut.duration(durations.short)}
      style={[styles.card, stuck && styles.stuck]}
    >
      <Image
        source={{ uri: scan.fileUri }}
        style={styles.thumb}
        contentFit="cover"
        transition={durations.short}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.middle}>
        <Text
          variant="caption"
          style={styles.message}
          color={stuck ? colors.attentionDeep : colors.ink}
          numberOfLines={3}
        >
          {message(scan)}
        </Text>
        {stuck ? (
          <View style={styles.buttons}>
            {scan.state === "failed" ? (
              <SmallButton label={s.common.retry} color={colors.brandAction} onPress={onRetry} />
            ) : null}
            {/* Removing throws the picture away: destructive. */}
            <SmallButton label={s.scan.remove} color={colors.negative} onPress={onRemove} />
          </View>
        ) : null}
      </View>
      {stuck ? null : offline ? (
        <SymbolView name="clock" size={18} tintColor={colors.inkMuted} />
      ) : (
        <ActivityIndicator color={colors.inkMuted} accessibilityElementsHidden />
      )}
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  // Needs the user, like a receipt to confirm: the honey rule.
  stuck: { borderLeftWidth: 3, borderLeftColor: colors.attention },
  thumb: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.skeleton },
  middle: { flex: 1, gap: 2 },
  message: { fontFamily: fonts.semibold },
  buttons: { flexDirection: "row", gap: space.lg },
  button: { minHeight: 44, justifyContent: "center" },
  buttonLabel: { fontFamily: fonts.bold },
}));
