// The capture button (DESIGN.md "FAB"): bottom centre, 64×64, brand action
// green, the only shadow in the app. Tap: the camera, one receipt. Touch and
// hold: several receipts with Apple's scanner, or photos from the library. It sits above the tab bar: the screens
// library's SafeAreaView knows the bar's height, React Native's doesn't.

import { ActionSheetIOS, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-screens/experimental";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { s } from "../i18n";
import { space, makeStyles, useColors } from "../theme";
import { PressableScale } from "./PressableScale";

export const SCAN_BUTTON_SPACE = 64 + space.lg * 2;

export function ScanButton({
  onScan,
  onScanSeveral,
  onPickPhotos,
}: {
  onScan: () => void;
  onScanSeveral: () => void;
  onPickPhotos: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const more = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [s.scan.several, s.scan.fromPhotos, s.common.cancel], cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) onScanSeveral();
        if (i === 1) onPickPhotos();
      },
    );
  return (
    <SafeAreaView edges={{ bottom: true }} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.place} pointerEvents="box-none">
        <PressableScale
          scaleTo={0.92}
          accessibilityRole="button"
          accessibilityLabel={s.scan.button}
          accessibilityHint={s.scan.longPressHint}
          accessibilityActions={[
            { name: "several", label: s.scan.several },
            { name: "photos", label: s.scan.fromPhotos },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "several") onScanSeveral();
            if (e.nativeEvent.actionName === "photos") onPickPhotos();
          }}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onScan();
          }}
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            more();
          }}
          style={styles.fab}
        >
          <SymbolView name="doc.viewfinder" size={28} tintColor={colors.onBrandAction} weight="semibold" />
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  place: { flex: 1, justifyContent: "flex-end", alignItems: "center", paddingBottom: space.lg },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandAction,
    alignItems: "center",
    justifyContent: "center",
    // DESIGN.md: the one shadow in the system.
    shadowColor: colors.brandDeep,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
}));
