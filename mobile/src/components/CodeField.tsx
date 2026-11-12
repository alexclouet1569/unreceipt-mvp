// Six cells for an email code over one invisible field, so taps, paste and
// iOS's code suggestion all land in it (the same field as the sign-in's
// code screen, src/app/verify.tsx). Shakes on a wrong code.

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { CODE_LENGTH } from "../config";
import { s } from "../i18n";
import { fonts, radius, space, makeStyles } from "../theme";
import { Text } from "./Text";

export type CodeFieldHandle = { shake: () => void; focus: () => void };

export const CodeField = forwardRef<
  CodeFieldHandle,
  { value: string; onChange: (digits: string) => void; disabled?: boolean; error?: boolean }
>(function CodeField({ value, onChange, disabled = false, error = false }, ref) {
  const styles = useStyles();
  const input = useRef<TextInputInstance>(null);
  const offset = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  useImperativeHandle(ref, () => ({
    shake: () => {
      offset.value = withSequence(...[-10, 10, -8, 8, -4, 0].map((x) => withTiming(x, { duration: 50 })));
    },
    focus: () => input.current?.focus(),
  }));

  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <Animated.View
        style={[styles.cells, shakeStyle]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const active = i === Math.min(value.length, CODE_LENGTH - 1) && !disabled;
          return (
            <View key={i} style={[styles.cell, active && styles.cellActive, error && styles.cellError]}>
              <Text style={styles.digit}>{value[i] ?? ""}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        autoFocus
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        caretHidden
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={s.signIn.codeLabel}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
});

const useStyles = makeStyles((colors) => ({
  cells: { flexDirection: "row", gap: space.sm, justifyContent: "space-between" },
  cell: {
    flex: 1,
    aspectRatio: 0.82,
    maxHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: { borderColor: colors.brandAction },
  cellError: { borderColor: colors.attention },
  digit: { fontFamily: fonts.bold, fontSize: 26, color: colors.ink },
  hiddenInput: { ...StyleSheet.absoluteFill, opacity: 0.02, color: "transparent" },
}));
