// The user's private receipt address with a Copy button that answers with a
// haptic tick and "Copied" for a moment.

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { s } from "../i18n";
import { colors, fonts, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function ForwardingCard({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <View style={styles.card}>
      <Text variant="body" style={styles.address} selectable numberOfLines={1} adjustsFontSizeToFit>
        {address}
      </Text>
      <PressableScale
        scaleTo={0.94}
        accessibilityRole="button"
        accessibilityLabel={copied ? s.common.copied : s.common.copy}
        onPress={async () => {
          await Clipboard.setStringAsync(address);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setCopied(true);
        }}
        style={[styles.copy, copied && styles.copied]}
      >
        <Text style={styles.copyLabel} color={copied ? colors.brandAction : colors.white}>
          {copied ? s.common.copied : s.common.copy}
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  address: { flex: 1, fontFamily: fonts.semibold },
  copy: {
    backgroundColor: colors.brandAction,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
  },
  copied: { backgroundColor: colors.brandTint },
  copyLabel: { fontFamily: fonts.bold, fontSize: 14 },
});
