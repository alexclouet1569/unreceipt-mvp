// Swipe a receipt left to reveal Delete (DESIGN.md "Swipe to delete"): an
// 88 pt action on --negative with a trash icon, drawn only while the card
// is moved, so a press never shows red behind it. Past the button the card
// follows at half speed. One row open at a time; scrolling closes it. A
// swipe alone never deletes; tapping the action does, behind an Undo bar.
// VoiceOver gets the same as an action on the card (ReceiptRow's onDelete),
// so the hidden button is kept out of its way.

import { useRef } from "react";
import { StyleSheet } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { s } from "../i18n";
import { colors, fonts, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

const ACTION_WIDTH = 88;

// The row currently open, so opening another (or scrolling) closes it.
let openRow: SwipeableMethods | null = null;

/** For the list's onScrollBeginDrag. */
export function closeOpenSwipe() {
  openRow?.close();
  openRow = null;
}

function DeleteAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
  const visible = useAnimatedStyle(() => ({ opacity: progress.value > 0.01 ? 1 : 0 }));
  return (
    <Animated.View
      style={[styles.actionWrap, visible]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PressableScale scaleTo={0.94} onPress={onPress} style={styles.action}>
        <SymbolView name="trash" size={20} tintColor={colors.white} />
        <Text style={styles.label} color={colors.white} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
          {s.edit.deleteShort}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

export function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <Swipeable
      ref={ref}
      friction={1}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight
      overshootFriction={2}
      containerStyle={styles.container}
      onSwipeableWillOpen={() => {
        if (openRow && openRow !== ref.current) openRow.close();
        openRow = ref.current;
      }}
      onSwipeableClose={() => {
        if (openRow === ref.current) openRow = null;
      }}
      renderRightActions={(progress) => (
        <DeleteAction
          progress={progress}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
        />
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "visible" },
  actionWrap: { width: ACTION_WIDTH + space.lg, paddingRight: space.lg, marginBottom: space.sm },
  action: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.negative,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: space.xs,
  },
  label: { fontFamily: fonts.bold, fontSize: 13 },
});
