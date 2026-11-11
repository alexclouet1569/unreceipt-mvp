// Your accountant: the firm that sees the company's receipts (stop
// sharing, its Monday reminder), an invite still waiting (withdraw), a
// firm's invite to answer, or a form to invite one. The website's
// AccountantSection, through the same routes; every refusal is explained in
// the app's language.

import { useState } from "react";
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { MobileAccountantLink } from "@/lib/mobile/types";
import { Button } from "../../../components/Button";
import { Group, Row, Section } from "../../../components/Grouped";
import { Text } from "../../../components/Text";
import { fill, locale, s } from "../../../i18n";
import {
  ApiError,
  inviteAccountant,
  removeAccountantLink,
  respondToInvite,
  setWeeklyReminders,
  type ApiResult,
} from "../../../lib/api";
import { useAccount } from "../../../lib/AccountProvider";
import { useAuth } from "../../../auth/AuthProvider";
import { dayMonthYear } from "../../../lib/format";
import { useHome } from "../../../lib/HomeProvider";
import { colors, fonts, radius, space } from "../../../theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sinceText(link: MobileAccountantLink): string {
  const d = link.since ? new Date(link.since) : null;
  return d && !Number.isNaN(d.getTime()) ? fill(s.accountant.since, { date: dayMonthYear(d, locale) }) : s.accountant.sees;
}

function remindersText(r: NonNullable<MobileAccountantLink["reminders"]>): string {
  if (r.optedOut) return s.accountant.remindersOff;
  return r.firmOn ? s.accountant.remindersOn : s.accountant.remindersFirmOff;
}

export default function AccountantScreen() {
  const { account, refresh } = useAccount();
  const home = useHome();
  const { email: ownEmail } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviteError, setShownError] = useState<string | null>(null);
  const setInviteError = (text: string | null) => {
    setShownError(text);
    if (text) AccessibilityInfo.announceForAccessibility(text);
  };
  const [sentTo, setSentTo] = useState<string | null>(null);
  if (!account) return null;

  const links = account.accountant;
  const active = links.filter((l) => l.status === "active");
  const sent = links.filter((l) => l.status === "sent");
  const invited = links.filter((l) => l.status === "invited");
  const canInvite = active.length === 0 && sent.length === 0;

  // Runs a change, then reloads; a refusal is an alert in the app's language.
  const act = async (key: string, call: () => Promise<ApiResult<unknown>>, explain: (r: { status: number; code: string | null }) => string) => {
    setBusy(key);
    try {
      const res = await call();
      if (!res.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(explain(res));
        return false;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([refresh(), home.refresh()]);
      return true;
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.accountant.failed);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const generic = () => s.accountant.failed;

  const stop = (link: MobileAccountantLink) =>
    Alert.alert(fill(s.accountant.stopConfirm, { firm: link.name }), s.accountant.stopBody, [
      { text: s.common.cancel, style: "cancel" },
      {
        text: s.accountant.stop,
        style: "destructive",
        onPress: () => void act(`${link.id}:remove`, () => removeAccountantLink(link.id), generic),
      },
    ]);

  const withdraw = (link: MobileAccountantLink) =>
    Alert.alert(fill(s.accountant.withdrawConfirm, { email: link.name }), undefined, [
      { text: s.common.cancel, style: "cancel" },
      {
        text: s.accountant.withdraw,
        style: "destructive",
        onPress: () => void act(`${link.id}:remove`, () => removeAccountantLink(link.id), generic),
      },
    ]);

  const answer = (link: MobileAccountantLink, action: "accept" | "decline") =>
    void act(`${link.id}:${action}`, () => respondToInvite(link.id, action), (r) =>
      r.status === 404 ? s.invite.gone : r.code === "wrong_account" ? s.invite.wrongAccount : r.status === 409 ? s.invite.alreadyLinked : s.invite.failed,
    );

  const invite = async () => {
    const address = email.trim();
    setInviteError(null);
    setSentTo(null);
    if (!EMAIL.test(address)) return setInviteError(s.accountant.invalidEmail);
    if (ownEmail && address.toLowerCase() === ownEmail.toLowerCase()) return setInviteError(s.accountant.ownEmail);
    const ok = await act("invite", () => inviteAccountant(address), (r) =>
      r.status === 429
        ? s.accountant.rateLimited
        : r.status === 409
          ? s.accountant.alreadyLinked
          : r.status === 403
            ? s.accountant.confirmFirst
            : r.status === 400
              ? s.accountant.invalidEmail
              : s.accountant.failed,
    );
    if (ok) {
      setEmail("");
      setSentTo(address);
      AccessibilityInfo.announceForAccessibility(fill(s.accountant.sent, { email: address }));
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Text variant="body" color={colors.inkMuted}>
        {s.accountant.intro}
      </Text>

      {active.map((link) => (
        <Group key={link.id}>
          <Row first label={link.name} detail={sinceText(link)} />
          {link.reminders ? (
            <Row
              label={fill(s.accountant.remindersTitle, { firm: link.name })}
              detail={remindersText(link.reminders)}
              right={
                <Switch
                  value={!link.reminders.optedOut}
                  disabled={busy !== null}
                  trackColor={{ true: colors.ink, false: colors.inkFaint }}
                  accessibilityLabel={fill(s.accountant.remindersTitle, { firm: link.name })}
                  accessibilityHint={remindersText(link.reminders)}
                  onValueChange={(on) =>
                    void act(`${link.id}:reminders`, () => setWeeklyReminders(link.id, on), generic)
                  }
                />
              }
            />
          ) : null}
          <Row
            label={s.accountant.stop}
            destructive
            chevron={false}
            busy={busy === `${link.id}:remove`}
            disabled={busy !== null}
            onPress={() => stop(link)}
          />
        </Group>
      ))}

      {sent.map((link) => (
        <Group key={link.id}>
          <Row first label={link.name} detail={s.accountant.sentStatus} />
          <Row
            label={s.accountant.withdraw}
            destructive
            chevron={false}
            busy={busy === `${link.id}:remove`}
            disabled={busy !== null}
            onPress={() => withdraw(link)}
          />
        </Group>
      ))}

      {invited.map((link) => (
        <View key={link.id} style={styles.card}>
          <Text style={styles.name}>{link.name}</Text>
          <Text variant="caption" color={colors.inkMuted}>
            {s.accountant.wants}
          </Text>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button
                label={s.invite.accept}
                kind="ink"
                busy={busy === `${link.id}:accept`}
                disabled={busy !== null}
                onPress={() => answer(link, "accept")}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={s.invite.decline}
                kind="outline"
                busy={busy === `${link.id}:decline`}
                disabled={busy !== null}
                onPress={() => answer(link, "decline")}
              />
            </View>
          </View>
        </View>
      ))}

      {canInvite ? (
        <Section title={s.accountant.inviteTitle} note={s.accountant.inviteBody}>
          <View style={styles.form}>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (inviteError) setInviteError(null);
              }}
              placeholder={s.accountant.invitePlaceholder}
              placeholderTextColor={colors.inkFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              returnKeyType="send"
              onSubmitEditing={() => void invite()}
              accessibilityLabel={s.accountant.inviteTitle}
              maxFontSizeMultiplier={1.4}
              style={[styles.input, inviteError && styles.inputError]}
            />
            <Button
              label={s.accountant.send}
              kind="outline"
              busy={busy === "invite"}
              disabled={busy !== null || email.trim().length < 3}
              onPress={() => void invite()}
            />
          </View>
        </Section>
      ) : null}

      {inviteError ? (
        <Text variant="caption" color={colors.attentionDeep}>
          {inviteError}
        </Text>
      ) : null}
      {sentTo ? (
        <Text variant="caption" color={colors.ink}>
          {fill(s.accountant.sent, { email: sentTo })}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xl },
  card: {
    gap: space.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: 14,
  },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  buttons: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  flex: { flex: 1 },
  form: { gap: space.sm },
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
});
