// Swipe a receipt left to reveal Delete (DESIGN.md "Swipe to delete"): an
// 88 pt action on --negative with a trash icon. A swipe alone never
// deletes; tapping the action does, behind an Undo bar. VoiceOver users get
// the same as an action on the card itself (ReceiptRow's onDelete).

import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { SymbolView } from "expo-symbols";
import { s } from "../i18n";
import { colors, fonts, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

const ACTION_WIDTH = 88;

export function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <Swipeable
      ref={ref}
      friction={1}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      containerStyle={styles.container}
      renderRightActions={() => (
        <View style={styles.actionWrap}>
          <PressableScale
            scaleTo={0.94}
            onPress={() => {
              ref.current?.close();
              onDelete();
            }}
            accessibilityRole="button"
            accessibilityLabel={s.edit.delete}
            style={styles.action}
          >
            <SymbolView name="trash" size={20} tintColor={colors.white} />
            <Text style={styles.label} color={colors.white}>
              {s.edit.deleteShort}
            </Text>
          </PressableScale>
        </View>
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
  },
  label: { fontFamily: fonts.bold, fontSize: 13 },
});
