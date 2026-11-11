// Automatic forwarding: the receipt address, what it does, the setup steps
// per mail provider (each opens the one-step-per-screen guide), forwarding
// by hand from the iPhone's Mail, and the user's own inboxes. The
// website's /app/settings/forwarding, for the phone. Rules can only be made
// in a browser, so "Email me the steps" sends the guide to the computer.

import { useState } from "react";
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "../../../auth/AuthProvider";
import { Button } from "../../../components/Button";
import { ForwardingCard } from "../../../components/ForwardingCard";
import { Group, Row, Section } from "../../../components/Grouped";
import { RichText } from "../../../components/RichText";
import { Text } from "../../../components/Text";
import { fill, locale, s } from "../../../i18n";
import { ApiError, addOwnAddress, removeOwnAddress, sendForwardingLink } from "../../../lib/api";
import { stepPieces, type GuideProvider } from "../../../lib/forwarding-guide";
import { useForwarding } from "../../../lib/useForwarding";
import { colors, fonts, radius, space } from "../../../theme";

const PROVIDERS: GuideProvider[] = ["gmail", "outlook", "icloud", "paid", "other"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForwardingScreen() {
  const { userId, email } = useAuth();
  const { data, error, loading, reload } = useForwarding(userId);
  const [busy, setBusy] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [addressError, setShownError] = useState<string | null>(null);
  const setAddressError = (text: string | null) => {
    setShownError(text);
    if (text) AccessibilityInfo.announceForAccessibility(text);
  };

  if (!data) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text variant="body" color={colors.inkMuted} style={styles.centerText}>
              {error === "offline" ? s.common.unreachable : s.forwarding.loadFailed}
            </Text>
            <Button label={s.common.retry} busy={loading} onPress={() => void reload()} />
          </>
        ) : null}
      </View>
    );
  }

  // The sign-in email's provider first.
  const order = data.suggested ? [data.suggested, ...PROVIDERS.filter((p) => p !== data.suggested)] : PROVIDERS;

  const emailMe = async () => {
    setBusy("link");
    try {
      const res = await sendForwardingLink();
      if (res.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(fill(s.forwarding.emailed, { email: email ?? "" }));
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(res.status === 429 ? s.forwarding.emailLimited : s.forwarding.emailFailed);
      }
    } catch (err) {
      Alert.alert(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.forwarding.emailFailed);
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const address = newAddress.trim().toLowerCase();
    setAddressError(null);
    if (!EMAIL.test(address)) return setAddressError(s.forwarding.ownInvalid);
    if (data.ownAddresses.extra.length >= data.ownAddresses.max) {
      return setAddressError(fill(s.forwarding.ownMax, { max: data.ownAddresses.max }));
    }
    setBusy("add");
    try {
      const res = await addOwnAddress(address);
      if (!res.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return setAddressError(res.status === 400 ? s.forwarding.ownInvalid : s.forwarding.ownFailed);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewAddress("");
      await reload();
    } catch (err) {
      setAddressError(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.forwarding.ownFailed);
    } finally {
      setBusy(null);
    }
  };

  const remove = (address: string) =>
    Alert.alert(fill(s.forwarding.removeConfirm, { email: address }), undefined, [
      { text: s.common.cancel, style: "cancel" },
      {
        text: s.forwarding.remove,
        style: "destructive",
        onPress: async () => {
          setBusy(`remove:${address}`);
          try {
            const res = await removeOwnAddress(address);
            if (!res.ok) Alert.alert(s.forwarding.ownFailed);
            else await reload();
          } catch (err) {
            Alert.alert(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.forwarding.ownFailed);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const phone = (template: string, name: string, key: string) =>
    stepPieces(template, { [name]: ["phone", key] }, data, locale);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      {data.address ? <ForwardingCard address={data.address} /> : null}
      <View style={styles.facts}>
        {[s.forwarding.factBecomes, s.forwarding.factWaits, s.forwarding.factPrivate].map((fact) => (
          <Text key={fact} variant="body" color={colors.inkMuted}>
            {fact}
          </Text>
        ))}
      </View>

      <Section title={s.forwarding.autoTitle} note={s.forwarding.autoNote}>
        <Group>
          <Row
            first
            label={s.forwarding.emailMe}
            detail={s.forwarding.emailMeDetail}
            busy={busy === "link"}
            chevron={false}
            onPress={() => void emailMe()}
          />
        </Group>
      </Section>

      <Section title={s.forwarding.whereTitle}>
        <Group>
          {order.map((p, i) => (
            <Row
              key={p}
              first={i === 0}
              label={s.forwarding.providers[p]}
              detail={p === data.suggested ? s.forwarding.yours : s.forwarding.providerHints[p]}
              onPress={() => router.push({ pathname: "/account/guide", params: { provider: p } })}
            />
          ))}
        </Group>
      </Section>

      <Section title={s.forwarding.handTitle}>
        <View style={styles.card}>
          {[
            [{ text: s.forwarding.hand1, strong: false }],
            phone(s.forwarding.hand2, "forward", "forward"),
            phone(s.forwarding.hand3, "to", "to"),
            [{ text: s.forwarding.hand4, strong: false }],
          ].map((pieces, i) => (
            <View
              key={i}
              style={styles.handRow}
              accessible
              accessibilityLabel={`${i + 1}. ${pieces.map((p) => p.text).join("")}${i === 2 ? `. ${s.forwarding.hand3Hint}` : ""}`}
            >
              <Text style={styles.number} color={colors.inkMuted}>
                {i + 1}
              </Text>
              <View style={styles.flex}>
                <RichText pieces={pieces} variant="body" />
                {i === 2 ? (
                  <Text variant="caption" color={colors.inkMuted}>
                    {s.forwarding.hand3Hint}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </Section>

      <Section title={s.forwarding.ownTitle} note={s.forwarding.ownIntro}>
        <Group>
          <Row first label={data.ownAddresses.signIn} detail={s.forwarding.signInEmail} />
          {data.ownAddresses.extra.map((address) => (
            <Row
              key={address}
              label={address}
              value={s.forwarding.remove}
              chevron={false}
              busy={busy === `remove:${address}`}
              disabled={busy !== null}
              onPress={() => remove(address)}
            />
          ))}
        </Group>
        <View style={styles.addRow}>
          <TextInput
            value={newAddress}
            onChangeText={(t) => {
              setNewAddress(t);
              if (addressError) setAddressError(null);
            }}
            placeholder={s.forwarding.addPlaceholder}
            placeholderTextColor={colors.inkFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            accessibilityLabel={s.forwarding.addPlaceholder}
            maxFontSizeMultiplier={1.4}
            style={[styles.input, addressError && styles.inputError]}
          />
          <View style={styles.addButton}>
            <Button
              label={s.forwarding.add}
              kind="outline"
              busy={busy === "add"}
              disabled={busy !== null || newAddress.trim().length < 3}
              onPress={() => void add()}
            />
          </View>
        </View>
        {addressError ? (
          <Text variant="caption" color={colors.attentionDeep}>
            {addressError}
          </Text>
        ) : null}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.xl },
  centerText: { textAlign: "center" },
  facts: { gap: space.sm },
  card: {
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: 14,
  },
  handRow: { flexDirection: "row", gap: space.md },
  number: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, minWidth: 14, fontVariant: ["tabular-nums"] },
  flex: { flex: 1, gap: 2 },
  addRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 52,
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
  addButton: { minWidth: 96 },
});
