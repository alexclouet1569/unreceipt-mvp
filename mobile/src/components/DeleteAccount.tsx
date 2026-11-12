// Delete account (App Store 5.1.1(v)), the website's DeleteAccountSection
// for the phone: say what goes, save the receipts first (or, for accounting
// firm staff, what happens to the firm), a switch to say it's done, then a
// last iOS alert. The server wants a sign-in from the last 30 minutes in
// this session: when it asks, a new email code is sent and checked here,
// and the deletion runs again by itself. Used by Account → Delete account
// and by the full-screen states (firm staff, inactive accounts).

import { useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { MobileAccount } from "@/lib/mobile/types";
import { useAuth } from "../auth/AuthProvider";
import { fill, s } from "../i18n";
import { ApiError, deleteAccountNow } from "../lib/api";
import { useAccount } from "../lib/AccountProvider";
import { useExport } from "../lib/useExport";
import { fonts, radius, space, makeStyles, useColors } from "../theme";
import { Button } from "./Button";
import { CodeField, type CodeFieldHandle } from "./CodeField";
import { ExportResult } from "./ExportResult";
import { ReceiptSkeleton } from "./Skeleton";
import { Text } from "./Text";

function firmNotice(exit: MobileAccount["firmExit"]): string | null {
  if (!exit) return null;
  if (exit === "unknown") return s.deletion.firmUnknown;
  switch (exit.kind) {
    case "stays":
      return fill(s.deletion.firmStays, { firm: exit.firmName });
    case "handover":
      return fill(s.deletion.firmHandover, { firm: exit.firmName, email: exit.successorEmail });
    case "close":
      return exit.activeClients === 0
        ? fill(s.deletion.firmCloseNone, { firm: exit.firmName })
        : exit.activeClients === 1
          ? fill(s.deletion.firmCloseOne, { firm: exit.firmName })
          : fill(s.deletion.firmCloseMany, { firm: exit.firmName, count: exit.activeClients });
  }
}

export function DeleteAccount() {
  const styles = useStyles();
  const colors = useColors();
  const { email, requestCode, verifyCode, signOut } = useAuth();
  const { account, error: loadError, refreshing, refresh } = useAccount();
  const exporter = useExport();
  const [understood, setUnderstood] = useState(false);
  const [phase, setPhase] = useState<"review" | "code" | "deleting">("review");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const field = useRef<CodeFieldHandle>(null);

  if (!account && !loadError) {
    // Shaped like content, never a lone spinner on an empty screen (DESIGN.md).
    return (
      <View style={styles.loading}>
        <ReceiptSkeleton rows={2} />
      </View>
    );
  }
  if (!account) {
    return (
      <View style={styles.center}>
        {loadError ? (
          <>
            <Text variant="body" color={colors.inkMuted} style={styles.centerText}>
              {loadError === "offline" ? s.common.unreachable : s.account.loadFailed}
            </Text>
            <Button label={s.common.retry} busy={refreshing} onPress={() => void refresh()} />
          </>
        ) : null}
      </View>
    );
  }

  const company = account.hasCompany;
  const notice = firmNotice(account.firmExit);
  const blocked = account.firmExit === "unknown";

  const fail = (text: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(text);
  };

  const run = async () => {
    setPhase("deleting");
    AccessibilityInfo.announceForAccessibility(s.deletion.deleting);
    try {
      const res = await deleteAccountNow();
      if (res.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(s.deletion.done);
        // The account is gone: clear this phone (saved list, scans, photos).
        await signOut();
        return;
      }
      if (res.status === 401 && res.code === "reauth_required") {
        const sent = email ? await requestCode(email) : "failed";
        if (sent !== "sent") {
          setPhase("review");
          return fail(sent === "rateLimited" ? s.signIn.rateLimited : s.signIn.sendFailed);
        }
        setCode("");
        setCodeError(null);
        setPhase("code");
        AccessibilityInfo.announceForAccessibility(fill(s.deletion.reauthBody, { email: email ?? "" }));
        return;
      }
      setPhase("review");
      fail(res.status === 429 ? s.deletion.rateLimited : s.deletion.failed);
    } catch (err) {
      setPhase("review");
      fail(err instanceof ApiError && err.kind === "offline" ? s.common.unreachable : s.deletion.failed);
    }
  };

  const confirm = () =>
    Alert.alert(s.deletion.confirmTitle, s.deletion.confirmBody, [
      { text: s.common.cancel, style: "cancel" },
      { text: s.deletion.confirmAction, style: "destructive", onPress: () => void run() },
    ]);

  const onCode = async (digits: string) => {
    setCode(digits);
    if (codeError) setCodeError(null);
    if (digits.length < 6 || !email) return;
    setChecking(true);
    const result = await verifyCode(email, digits);
    setChecking(false);
    if (result === "ok") {
      await run();
      return;
    }
    setCode("");
    field.current?.shake();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const message =
      result === "expired" ? s.signIn.expiredCode : result === "unreachable" ? s.common.unreachable : s.signIn.wrongCode;
    setCodeError(message);
    AccessibilityInfo.announceForAccessibility(message);
    field.current?.focus();
  };

  if (phase === "deleting") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.inkMuted} />
        <Text variant="body" color={colors.inkMuted}>
          {s.deletion.deleting}
        </Text>
      </View>
    );
  }

  if (phase === "code") {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="displayLg">{s.deletion.reauthTitle}</Text>
        <Text variant="body" color={colors.inkMuted}>
          {fill(s.deletion.reauthBody, { email: email ?? "" })}
        </Text>
        <CodeField ref={field} value={code} onChange={(d) => void onCode(d)} disabled={checking} error={Boolean(codeError)} />
        {codeError ? (
          <Text variant="caption" color={colors.attentionDeep}>
            {codeError}
          </Text>
        ) : null}
        <Button label={s.common.cancel} kind="plain" onPress={() => setPhase("review")} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Text variant="body" color={colors.inkMuted}>
        {company ? s.deletion.body : s.deletion.firmBody}
      </Text>
      {notice && company ? (
        <Text variant="body" color={blocked ? colors.attentionDeep : colors.ink}>
          {notice}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text variant="micro" color={colors.inkMuted} accessibilityRole="header">
          {company ? s.deletion.saveStep : s.deletion.firmStep}
        </Text>
        {company ? (
          <>
            <Text variant="body" color={colors.inkMuted}>
              {s.deletion.saveBody}
            </Text>
            <Button
              label={s.deletion.exportAll}
              kind="outline"
              busy={exporter.busy === "all"}
              onPress={() => void exporter.run("all", s.exporting.everything)}
            />
            <ExportResult state={exporter} />
          </>
        ) : (
          <Text variant="body" color={blocked ? colors.attentionDeep : colors.ink}>
            {notice ?? s.deletion.firmUnknown}
          </Text>
        )}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{company ? s.deletion.savedSwitch : s.deletion.firmSwitch}</Text>
          <Switch
            value={understood}
            onValueChange={setUnderstood}
            disabled={blocked}
            trackColor={{ true: colors.ink, false: colors.inkFaint }}
            thumbColor={colors.switchThumb}
            accessibilityLabel={company ? s.deletion.savedSwitch : s.deletion.firmSwitch}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text variant="micro" color={colors.inkMuted} accessibilityRole="header">
          {s.deletion.deleteStep}
        </Text>
        <Button label={s.deletion.button} kind="destructive" disabled={!understood || blocked} onPress={confirm} />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.xl },
  centerText: { textAlign: "center" },
  loading: { paddingTop: space.lg },
  card: {
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: 14,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  switchLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
}));
