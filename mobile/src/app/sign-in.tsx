// Step 1 of 2: the email address. One field, one button, the keyboard up at
// once. The code arrives by email (step 2: verify.tsx).

import { useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark, Wordmark } from "../components/Brand";
import { Button } from "../components/Button";
import { PressableScale } from "../components/PressableScale";
import { Text } from "../components/Text";
import { PRIVACY_URL, REVIEW_EMAIL } from "../config";
import { s } from "../i18n";
import { durations, fonts, radius, space, makeStyles, useColors } from "../theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const styles = useStyles();
  const colors = useColors();
  const { requestCode, signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  // App Review's address asks for its password instead of a code.
  const [password, setPassword] = useState("");
  const reviewer = email.trim().toLowerCase() === REVIEW_EMAIL;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setError(s.signIn.invalidEmail);
      AccessibilityInfo.announceForAccessibility(s.signIn.invalidEmail);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (value === REVIEW_EMAIL) {
      if (!password) return;
      setBusy(true);
      setError(null);
      const signedIn = await signInWithPassword(value, password);
      setBusy(false);
      if (signedIn === "ok") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      const message = signedIn === "unreachable" ? s.common.unreachable : s.signIn.wrongPassword;
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestCode(value);
    setBusy(false);
    if (result === "sent") {
      router.push({ pathname: "/verify", params: { email: value } });
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const message =
      result === "rateLimited"
        ? s.signIn.rateLimited
        : result === "unreachable"
          ? s.common.unreachable
          : s.signIn.sendFailed;
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Animated.View entering={FadeIn.duration(durations.medium)} style={styles.hero}>
          <BrandMark size={72} />
          <Wordmark size={30} />
          <Text variant="accent" color={colors.inkMuted} style={styles.center}>
            {s.signIn.tagline}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(durations.medium)} style={styles.form}>
          <Text variant="micro" color={colors.inkMuted}>
            {s.signIn.emailLabel}
          </Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => void submit()}
            placeholder={s.signIn.emailPlaceholder}
            placeholderTextColor={colors.inkFaint}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType="go"
            editable={!busy}
            maxFontSizeMultiplier={1.4}
            accessibilityLabel={s.signIn.emailLabel}
            style={[styles.input, focused && styles.inputFocused, error && styles.inputError]}
          />
          {reviewer ? (
            <Animated.View entering={FadeIn.duration(durations.short)} style={styles.password}>
              <Text variant="micro" color={colors.inkMuted}>
                {s.signIn.passwordLabel}
              </Text>
              <TextInput
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError(null);
                }}
                onSubmitEditing={() => void submit()}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                editable={!busy}
                maxFontSizeMultiplier={1.4}
                accessibilityLabel={s.signIn.passwordLabel}
                style={[styles.input, error && styles.inputError]}
              />
            </Animated.View>
          ) : null}
          {error ? (
            <Animated.View entering={FadeIn.duration(durations.short)}>
              <Text variant="caption" color={colors.attentionDeep}>
                {error}
              </Text>
            </Animated.View>
          ) : null}
          <View style={styles.button}>
            <Button label={s.signIn.continue} onPress={() => void submit()} busy={busy} disabled={!email.trim()} />
          </View>
          {/* The privacy policy, one tap away before signing in (App Store 5.1.1(i)). */}
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel={s.signIn.privacyLink}
            accessibilityHint={s.signIn.privacyNote}
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
            style={styles.privacy}
          >
            <Text variant="caption" color={colors.inkMuted} style={styles.center}>
              {s.signIn.privacyNote}{" "}
              <Text variant="caption" color={colors.ink} style={styles.link}>
                {s.signIn.privacyLink}
              </Text>
            </Text>
          </PressableScale>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  fill: { flex: 1, paddingHorizontal: space.xl },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.md },
  center: { textAlign: "center" },
  form: { gap: space.sm, paddingBottom: space.lg },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.ink,
  },
  inputFocused: { borderColor: colors.brandAction },
  // Not a destructive error: honey, never red (DESIGN.md decisions 2026-10-15, 2026-11-08).
  inputError: { borderColor: colors.attention },
  button: { marginTop: space.sm, marginBottom: space.sm },
  password: { gap: space.sm, marginTop: space.sm },
  // At least 44 pt tall to tap (Apple HIG).
  privacy: { minHeight: 44, justifyContent: "center" },
  link: { fontFamily: fonts.semibold, textDecorationLine: "underline" },
}));
