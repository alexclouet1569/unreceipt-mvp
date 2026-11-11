// The website's pilot banner, for the app: mint (one of the three places
// mint is allowed, DESIGN.md), hidden for good with its ×. Never "free":
// it would imply a price later (App Store 3.1.3(f), mobile/AGENTS.md).

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SymbolView } from "expo-symbols";
import { s } from "../i18n";
import { colors, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

const KEY = "pilot-box:hidden";

export function PilotBox() {
  // Hidden until we know it wasn't dismissed, so it never flashes.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setHidden(v === "1"))
      .catch(() => setHidden(false));
  }, []);
  if (hidden) return null;
  return (
    <View style={styles.box}>
      <SymbolView name="sparkles" size={16} tintColor={colors.inkMuted} />
      <Text variant="caption" style={styles.text}>
        {s.summary.pilot}
      </Text>
      <PressableScale
        scaleTo={0.9}
        hitSlop={8}
        onPress={() => {
          setHidden(true);
          void AsyncStorage.setItem(KEY, "1").catch(() => {});
        }}
        accessibilityRole="button"
        accessibilityLabel={s.summary.hidePilot}
        style={styles.close}
      >
        <SymbolView name="xmark" size={13} weight="semibold" tintColor={colors.inkMuted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingLeft: 14,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.brandTint,
  },
  text: { flex: 1, color: colors.ink, paddingVertical: space.sm },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
