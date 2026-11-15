// "Invite a client" (accounting firm staff): the company's name and the
// email of the person who will connect; POST /api/firm/clients, the
// website's own route (the firm comes from the session; the name is checked
// like a firm's, since it goes into the email). Every refusal is explained
// in the app's language.

import { useState } from "react";
import { AccessibilityInfo, Alert, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Button } from "../../../components/Button";
import { Text } from "../../../components/Text";
import { fill, s } from "../../../i18n";
import { ApiError, inviteClient } from "../../../lib/api";
import { useFirm } from "../../../lib/FirmProvider";
import { fonts, radius, space, makeStyles, useColors } from "../../../theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function InviteClient() {
  const styles = useStyles();
  const colors = useColors();
  const { refresh } = useFirm();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setShownError] = useState<string | null>(null);
  // Which field the error is about: its border turns honey.
  const [errorField, setErrorField] = useState<"name" | "email" | null>(null);
  const setError = (text: string | null, field: "name" | "email" | null = null) => {
    setShownError(text);
    setErrorField(text ? field : null);
    if (text) AccessibilityInfo.announceForAccessibility(text);
  };

  const send = async () => {
    if (busy) return;
    const address = email.trim();
    if (!EMAIL.test(address)) return setError(s.firm.inviteBadEmail, "email");
    setBusy(true);
    setError(null);
    try {
      const res = await inviteClient({ client_name: name.trim(), email: address });
      if (res.status === 201) {
        void refresh();
        if (res.emailed) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          AccessibilityInfo.announceForAccessibility(fill(s.firm.inviteSent, { email: address }));
        } else {
          // Saved, but the email didn't go out: say so where everyone sees it.
          Alert.alert(s.firm.inviteSavedTitle, fill(s.firm.inviteSaved, { email: address }));
        }
        router.back();
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // The server's 400 is about the name or the address; its English
      // message is never shown.
      if (res.status === 400) {
        const aboutEmail = /email/i.test(res.error ?? "");
        setError(aboutEmail ? s.firm.inviteBadEmail : s.firm.inviteBadName, aboutEmail ? "email" : "name");
      } else {
        setError(res.status === 429 ? s.firm.inviteTooMany : s.firm.inviteFailed);
      }
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.firm.inviteFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text variant="displayLg" accessibilityRole="header">
        {s.firm.inviteTitle}
      </Text>
      <Text variant="body" color={colors.inkMuted}>
        {s.firm.inviteBody}
      </Text>
      <View style={styles.field}>
        <Text variant="caption" color={colors.inkMuted} style={styles.label}>
          {s.firm.companyName}
        </Text>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (error) setError(null);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          maxLength={200}
          accessibilityLabel={s.firm.companyName}
          maxFontSizeMultiplier={1.4}
          style={[styles.input, errorField === "name" ? styles.inputError : null]}
        />
      </View>
      <View style={styles.field}>
        <Text variant="caption" color={colors.inkMuted} style={styles.label}>
          {s.firm.theirEmail}
        </Text>
        <TextInput
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (error) setError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          maxLength={320}
          accessibilityLabel={s.firm.theirEmail}
          maxFontSizeMultiplier={1.4}
          style={[styles.input, errorField === "email" ? styles.inputError : null]}
        />
      </View>
      {error ? (
        <Text variant="caption" color={colors.attentionDeep}>
          {error}
        </Text>
      ) : null}
      <Button
        label={s.firm.send}
        kind="ink"
        busy={busy}
        disabled={busy || name.trim().length < 2 || email.trim().length < 3}
        onPress={() => void send()}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: space.lg, paddingTop: space.xl, gap: space.md },
  field: { gap: space.xs },
  label: { fontFamily: fonts.semibold },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.attention },
}));
