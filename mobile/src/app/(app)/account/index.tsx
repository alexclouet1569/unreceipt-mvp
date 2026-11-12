// Account: the receipt address and its setup guide, the company (export,
// currency, accountant), who is signed in, sign out, delete the account.
// Each row pushes its own screen, like iOS Settings. Opens on the saved
// copy; pull down to refresh.

import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useAuth } from "../../../auth/AuthProvider";
import { ForwardingCard } from "../../../components/ForwardingCard";
import { Group, Row, Section } from "../../../components/Grouped";
import { GroupedSkeleton } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { fill, LANGUAGE_NAMES, locale, s } from "../../../i18n";
import type { MobileAccount } from "@/lib/mobile/types";
import { useAccount } from "../../../lib/AccountProvider";
import { dayTime } from "../../../lib/format";
import { useHome } from "../../../lib/HomeProvider";
import { useScans } from "../../../lib/scans/ScanProvider";
import { colors, radius, space } from "../../../theme";

function accountantValue(account: MobileAccount | null): string | null {
  if (!account) return null;
  const links = account.accountant;
  const active = links.find((l) => l.status === "active");
  if (active) return active.name;
  if (links.some((l) => l.status === "invited")) return s.account.accountantInvited;
  if (links.some((l) => l.status === "sent")) return s.account.accountantSent;
  return s.account.accountantNone;
}

export default function Account() {
  const { email, signOut } = useAuth();
  const { home, refresh: refreshHome } = useHome();
  const { account, error, refreshing, refresh } = useAccount();

  const { pending } = useScans();
  // Everything not yet a receipt, "Try again" ones included.
  const unsent = pending.filter((p) => p.state !== "notReceipt").length;

  const confirmSignOut = () =>
    Alert.alert(s.account.signOutConfirm, unsent > 0 ? fill(s.account.signOutPending, { count: unsent }) : undefined, [
      { text: s.common.cancel, style: "cancel" },
      { text: s.account.signOut, style: "destructive", onPress: () => void signOut() },
    ]);

  const ready = home?.state === "ready" ? home : null;
  const currency = account?.currency?.value ?? ready?.homeCurrency ?? null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void Promise.all([refresh(), refreshHome()])}
          tintColor={colors.inkMuted}
        />
      }
    >
      {error && !account ? (
        <Text variant="caption" color={colors.attentionDeep}>
          {error === "offline" ? s.common.unreachable : s.account.loadFailed}
        </Text>
      ) : null}

      {/* The very first load: shapes, never an empty screen or a spinner. */}
      {!ready && !account && !error ? <GroupedSkeleton /> : null}

      {ready ? (
        <Section title={s.account.forwardingTitle} note={s.account.forwardingBody}>
          <ForwardingCard address={ready.forwardingEmail} />
          <Group>
            <Row
              first
              label={s.account.setupForwarding}
              detail={s.account.setupForwardingNote}
              onPress={() => router.push("/account/forwarding")}
            />
          </Group>
        </Section>
      ) : null}

      {ready ? (
        <Section title={s.account.company}>
          <Group>
            <Row first label={s.account.export} onPress={() => router.push("/account/export")} />
            <Row
              label={s.account.currency}
              value={currency}
              disabled={!account?.currency}
              onPress={() => router.push("/account/currency")}
            />
            <Row
              label={s.account.accountant}
              value={accountantValue(account)}
              disabled={!account}
              onPress={() => router.push("/account/accountant")}
            />
          </Group>
        </Section>
      ) : null}

      <Section title={s.account.signedInAs}>
        <View style={styles.card}>
          <Text variant="merchant">{email}</Text>
        </View>
      </Section>

      {/* The app follows the iPhone's language; its page in the Settings app can change it. */}
      <Section note={s.account.languageNote}>
        <Group>
          <Row
            first
            label={s.account.language}
            value={LANGUAGE_NAMES[locale]}
            onPress={() => void Linking.openSettings()}
          />
        </Group>
      </Section>

      <Group>
        <Row first label={s.account.signOut} destructive chevron={false} onPress={confirmSignOut} />
      </Group>

      {/* Kept apart from Sign out, at the very end, like iOS Settings. */}
      <View style={styles.end}>
        <Group>
          <Row first label={s.account.deleteAccount} destructive onPress={() => router.push("/account/delete")} />
        </Group>
        <Text variant="caption" color={colors.inkFaint} style={styles.center}>
          {fill(s.account.version, { version: Constants.expoConfig?.version ?? "" })}
          {/* Running an over-the-air update: when it was published, so we know
              which version someone has (README "Releases"). */}
          {!Updates.isEmbeddedLaunch && Updates.createdAt
            ? ` · ${fill(s.account.updated, { date: dayTime(Updates.createdAt, locale) })}`
            : null}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xl },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  end: { marginTop: space.xl, gap: space.md },
  center: { textAlign: "center" },
});
