// "Share your receipts with <firm>?" at the top of the receipts list, so a
// client answers an accounting firm's invite without finding the email
// (the website's AccountantInviteNotice). The answer goes through the same
// POST /api/accountant/respond; the server matches the invite to the
// signed-in, confirmed address. Accept is ink, not green: the scan button
// stays the screen's one green action.

import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { fill, s } from "../i18n";
import { ApiError, respondToInvite } from "../lib/api";
import { useHome } from "../lib/HomeProvider";
import { colors, durations, radius, space } from "../theme";
import { Button } from "./Button";
import { Text } from "./Text";

// How long "Done. <firm> now gets your receipts." stays before the card goes.
const DONE_MS = 4_000;

function errorText(status: number, code: string | null): string {
  if (status === 404 || code === "not_found") return s.invite.gone;
  if (code === "wrong_account") return s.invite.wrongAccount;
  if (status === 409) return s.invite.alreadyLinked;
  return s.invite.failed;
}

export function InviteCard({ invite }: { invite: { id: string; firmName: string } }) {
  const { mutateHome, refresh } = useHome();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"active" | "revoked" | null>(null);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      mutateHome((h) => ({ ...h, accountantInvites: h.accountantInvites.filter((i) => i.id !== invite.id) }));
      void refresh();
    }, DONE_MS);
    return () => clearTimeout(t);
  }, [done, invite.id, mutateHome, refresh]);

  const say = (text: string) => AccessibilityInfo.announceForAccessibility(text);

  const respond = async (action: "accept" | "decline") => {
    setBusy(action);
    setError(null);
    try {
      const res = await respondToInvite(invite.id, action);
      if (!res.ok) {
        const text = errorText(res.status, res.code);
        setError(text);
        say(text);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      const status = res.data.status ?? (action === "accept" ? "active" : "revoked");
      setDone(status);
      say(status === "active" ? fill(s.invite.accepted, { firm: invite.firmName }) : s.invite.declined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const text = err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.invite.failed;
      setError(text);
      say(text);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(durations.medium)}
      exiting={FadeOut.duration(durations.short)}
      style={styles.card}
      accessibilityRole="summary"
    >
      {done ? (
        <Text variant="bodyLg" accessibilityLiveRegion="polite">
          {done === "active" ? fill(s.invite.accepted, { firm: invite.firmName }) : s.invite.declined}
        </Text>
      ) : (
        <>
          <View style={styles.text}>
            <Text variant="bodyLg" accessibilityRole="header">
              {fill(s.invite.title, { firm: invite.firmName })}
            </Text>
            <Text variant="body" color={colors.inkMuted}>
              {s.invite.body}
            </Text>
          </View>
          <View style={styles.buttons}>
            <View style={styles.button}>
              <Button
                label={s.invite.accept}
                kind="ink"
                busy={busy === "accept"}
                disabled={busy !== null}
                onPress={() => void respond("accept")}
              />
            </View>
            <View style={styles.button}>
              <Button
                label={s.invite.decline}
                kind="outline"
                busy={busy === "decline"}
                disabled={busy !== null}
                onPress={() => void respond("decline")}
              />
            </View>
          </View>
          {error ? (
            <Text variant="caption" color={colors.attentionDeep}>
              {error}
            </Text>
          ) : null}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    marginHorizontal: space.lg,
    marginTop: space.md,
  },
  text: { gap: space.xs },
  buttons: { flexDirection: "row", gap: space.sm },
  button: { flex: 1 },
});
