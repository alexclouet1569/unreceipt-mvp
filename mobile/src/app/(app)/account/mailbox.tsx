// One connected mailbox, pushed from Account → Your email: its address and
// status, Reconnect (outline, when it needs it and the provider can be
// connected), and Disconnect as a red row like Sign out (asks first). Once
// it's gone the screen closes by itself, and Account says so to VoiceOver.

import { useEffect, useRef } from "react";
import { ScrollView } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Button } from "../../../components/Button";
import { Group, Row, Section, SectionNote } from "../../../components/Grouped";
import { GroupedSkeleton } from "../../../components/Skeleton";
import { fill, locale, s } from "../../../i18n";
import { statusLine } from "../../../lib/mailboxes";
import { useMailboxes } from "../../../lib/MailboxesProvider";
import { space, makeStyles, useColors } from "../../../theme";

export default function MailboxScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, providers, connect, disconnect, connecting, disconnecting } = useMailboxes();
  const conn = data?.connections.find((c) => c.id === id) ?? null;

  // Disconnected here (or gone by a refresh): back to Account.
  const left = useRef(false);
  useEffect(() => {
    if (!data || conn || left.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
  }, [data, conn]);

  if (!conn) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <GroupedSkeleton groups={[1, 1]} />
      </ScrollView>
    );
  }

  const name = conn.provider === "google" ? s.mailboxes.providerGoogle : s.mailboxes.providerMicrosoft;
  const status = statusLine(conn, s.mailboxes, locale);
  const canReconnect = conn.status === "needs_reconnect" && providers.includes(conn.provider);
  const removing = disconnecting === conn.id;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: name }} />
      <Section>
        <Group>
          <Row
            first
            label={conn.email}
            detail={status.text}
            detailColor={status.tone === "attention" ? colors.attentionDeep : undefined}
          />
        </Group>
        {canReconnect ? <SectionNote text={s.mailboxes.reconnectNote} /> : null}
      </Section>

      {canReconnect ? (
        <Button
          kind="outline"
          label={s.mailboxes.reconnect}
          busy={connecting === conn.provider}
          disabled={connecting != null || removing}
          onPress={() => connect(conn.provider)}
        />
      ) : null}

      <Section note={s.mailboxes.disconnectBody}>
        <Group>
          <Row
            first
            label={s.mailboxes.disconnect}
            destructive
            chevron={false}
            busy={removing}
            disabled={disconnecting != null || connecting != null}
            accessibilityHint={fill(s.mailboxes.disconnectLabel, { email: conn.email })}
            onPress={() => disconnect(conn)}
          />
        </Group>
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.xl },
}));
