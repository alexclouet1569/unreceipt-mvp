// Step 2 of 2: the 6-digit code. iOS offers the code from Mail above the
// keyboard (oneTimeCode); the sixth digit checks it, no button needed. A
// wrong code shakes the cells and buzzes, like the iPhone passcode screen.

import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { Text } from "../components/Text";
import { CODE_LENGTH } from "../config";
import { fill, s } from "../i18n";
import { colors, durations, fonts, radius, space } from "../theme";

const RESEND_AFTER_S = 30;

export default function Verify() {
  const { email = "" } = useLocalSearchParams<{ email: string }>();
  const { verifyCode, requestCode } = useAuth();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_AFTER_S);
  const input = useRef<TextInputInstance>(null);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const check = async (value: string) => {
    setChecking(true);
    setError(null);
    const result = await verifyCode(email, value);
    if (result === "ok") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The root layout moves on to the receipts by itself.
      return;
    }
    setChecking(false);
    setCode("");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shake.value = withSequence(
      ...[-10, 10, -8, 8, -4, 0].map((x) => withTiming(x, { duration: 50 })),
    );
    const message =
      result === "expired"
        ? s.signIn.expiredCode
        : result === "unreachable"
          ? s.common.unreachable
          : s.signIn.wrongCode;
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
    input.current?.focus();
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length > code.length) void Haptics.selectionAsync();
    if (digits.length === CODE_LENGTH) void check(digits);
  };

  const resend = async () => {
    setNote(null);
    setError(null);
    const result = await requestCode(email);
    if (result === "sent") {
      setNote(s.signIn.resent);
      AccessibilityInfo.announceForAccessibility(s.signIn.resent);
      setWait(RESEND_AFTER_S);
      setCode("");
      input.current?.focus();
    } else {
      const message = result === "rateLimited" ? s.signIn.rateLimited : s.signIn.sendFailed;
      setNote(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Animated.View entering={FadeIn.duration(durations.medium)} style={styles.top}>
          <Text variant="displayXl">{s.signIn.codeTitle}</Text>
          <Text variant="body" color={colors.inkMuted}>
            {fill(s.signIn.codeSubtitle, { email })}
          </Text>
        </Animated.View>

        <Pressable onPress={() => input.current?.focus()} accessible={false}>
          {/* The cells only draw the digits; VoiceOver reads the field below. */}
          <Animated.View
            style={[styles.cells, shakeStyle]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {Array.from({ length: CODE_LENGTH }, (_, i) => {
              const active = i === Math.min(code.length, CODE_LENGTH - 1) && !checking;
              return (
                <View
                  key={i}
                  style={[styles.cell, active && styles.cellActive, error && styles.cellError]}
                >
                  <Text style={styles.digit}>{code[i] ?? ""}</Text>
                </View>
              );
            })}
          </Animated.View>
          {/* The real field: invisible, on top of the cells, so taps, paste
              and the iOS code suggestion all go to it. */}
          <TextInput
            ref={input}
            value={code}
            onChangeText={onChange}
            autoFocus
            editable={!checking}
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

        {error ? (
          <Animated.View entering={FadeIn.duration(durations.short)}>
            <Text variant="caption" color={colors.attentionDeep}>
              {error}
            </Text>
          </Animated.View>
        ) : null}
        {note ? (
          <Text variant="caption" color={colors.inkMuted}>
            {note}
          </Text>
        ) : null}

        <View style={styles.spacer} />
        <Button
          label={wait > 0 ? `${s.signIn.resend} (${wait})` : s.signIn.resend}
          kind="plain"
          disabled={wait > 0 || checking}
          onPress={() => void resend()}
        />
        <Button label={s.signIn.changeEmail} kind="plain" onPress={() => router.back()} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  fill: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.xxxl, gap: space.md },
  top: { gap: space.sm, marginBottom: space.lg },
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
  // Not a destructive error: honey, never red (DESIGN.md).
  cellError: { borderColor: colors.attention },
  digit: { fontFamily: fonts.bold, fontSize: 26, color: colors.ink },
  hiddenInput: { ...StyleSheet.absoluteFill, opacity: 0.02, color: "transparent" },
  spacer: { flex: 1 },
});
