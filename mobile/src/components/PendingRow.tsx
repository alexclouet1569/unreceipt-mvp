// A scan on its way: its own picture, "Reading your receipt…", then it turns
// into the receipt. Waiting offline says so calmly; a picture the server
// refused can be removed.

import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { s } from "../i18n";
import type { PendingScan } from "../lib/scans/queue";
import { colors, durations, fonts, radius, space } from "../theme";
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

export function PendingRow({ scan, onRemove }: { scan: PendingScan; onRemove: () => void }) {
  const stuck = scan.state === "notReceipt" || scan.state === "failed";
  const text = message(scan);
  return (
    <Animated.View
      entering={FadeIn.duration(durations.medium)}
      exiting={FadeOut.duration(durations.short)}
      style={[styles.card, stuck && styles.stuck]}
      accessible
      accessibilityLabel={text}
    >
      <Image source={{ uri: scan.fileUri }} style={styles.thumb} contentFit="cover" transition={durations.short} />
      <View style={styles.middle}>
        <Text variant="caption" style={styles.message} color={stuck ? colors.attentionDeep : colors.ink} numberOfLines={2}>
          {text}
        </Text>
      </View>
      {stuck ? (
        <PressableScale
          scaleTo={0.94}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={s.scan.remove}
          hitSlop={8}
          style={styles.remove}
        >
          <Text variant="caption" style={styles.removeLabel} color={colors.brandAction}>
            {s.scan.remove}
          </Text>
        </PressableScale>
      ) : (
        <ActivityIndicator color={colors.inkMuted} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
  middle: { flex: 1 },
  message: { fontFamily: fonts.semibold },
  remove: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  removeLabel: { fontFamily: fonts.bold },
});
