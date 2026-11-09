// Step 1 of 2: the email address. One field, one button, the keyboard up at
// once. The code arrives by email (step 2: verify.tsx).

import { useState } from "react";
import { KeyboardAvoidingView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark, Wordmark } from "../components/Brand";
import { Button } from "../components/Button";
import { Text } from "../components/Text";
import { s } from "../i18n";
import { colors, fonts, radius, space } from "../theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const { requestCode } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setError(s.signIn.invalidEmail);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
    setError(
      result === "rateLimited"
        ? s.signIn.rateLimited
        : result === "unreachable"
          ? s.common.unreachable
          : s.signIn.sendFailed,
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Animated.View entering={FadeIn.duration(480)} style={styles.hero}>
          <BrandMark size={72} />
          <Wordmark size={30} />
          <Text variant="accent" color={colors.inkMuted} style={styles.center}>
            {s.signIn.tagline}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(480).delay(120)} style={styles.form}>
          <Text variant="micro" color={colors.inkFaint}>
            {s.signIn.emailLabel.toUpperCase()}
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
            accessibilityLabel={s.signIn.emailLabel}
            style={[styles.input, focused && styles.inputFocused, error && styles.inputError]}
          />
          {error ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Text variant="caption" color={colors.negative} accessibilityLiveRegion="polite">
                {error}
              </Text>
            </Animated.View>
          ) : null}
          <View style={styles.button}>
            <Button label={s.signIn.continue} onPress={() => void submit()} busy={busy} disabled={!email.trim()} />
          </View>
          <Text variant="caption" color={colors.inkFaint} style={styles.center}>
            {s.signIn.privacy}
          </Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  inputError: { borderColor: colors.negative },
  button: { marginTop: space.sm, marginBottom: space.sm },
});
