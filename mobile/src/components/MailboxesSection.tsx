// Account → Your email: each connected Gmail / Outlook mailbox with its
// status in plain words, Reconnect when it needs it and Disconnect; then
// Connect Gmail / Connect Outlook (or "Add another mailbox") and the way to
// forwarding for every other kind of email. Hidden until the server says a
// provider can be connected or a mailbox is already there.

import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { MobileMailboxConnection } from "@/lib/mobile/types";
import { fill, locale, s } from "../i18n";
import { statusLine } from "../lib/mailboxes";
import { useMailboxes } from "../lib/MailboxesProvider";
import { fonts, radius, space, makeStyles, useColors } from "../theme";
import { Group, Row, Section } from "./Grouped";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

function SmallButton({
  label,
  accessibilityLabel,
  onPress,
  busy = false,
  disabled = false,
  destructive = false,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  const inactive = disabled || busy;
  return (
    <PressableScale
      scaleTo={0.96}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      style={[styles.small, inactive && styles.inactive]}
    >
      {busy ? (
        <ActivityIndicator color={colors.inkMuted} />
      ) : (
        <Text style={styles.smallLabel} color={destructive ? colors.negative : colors.ink}>
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

function MailboxRow({ conn, first }: { conn: MobileMailboxConnection; first: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const { providers, connect, disconnect, connecting, disconnecting } = useMailboxes();
  const status = statusLine(conn, s.mailboxes, locale);
  const name = conn.provider === "google" ? s.mailboxes.providerGoogle : s.mailboxes.providerMicrosoft;
  const canReconnect = conn.status !== "active" && providers.includes(conn.provider);
  const busy = connecting != null || disconnecting != null;
  return (
    <View style={[styles.mailbox, !first && styles.divider]}>
      <View accessible accessibilityLabel={`${name}, ${status.text}`} style={styles.texts}>
        <Text variant="merchant">{name}</Text>
        <Text variant="caption" color={status.tone === "attention" ? colors.attentionDeep : colors.inkMuted}>
          {status.text}
        </Text>
      </View>
      <View style={styles.buttons}>
        {canReconnect ? (
          <SmallButton
            label={s.mailboxes.reconnect}
            accessibilityLabel={fill(s.mailboxes.reconnectLabel, { email: conn.email })}
            busy={connecting === conn.provider}
            disabled={busy}
            onPress={() => connect(conn.provider)}
          />
        ) : null}
        <SmallButton
          label={s.mailboxes.disconnect}
          accessibilityLabel={fill(s.mailboxes.disconnectLabel, { email: conn.email })}
          destructive
          busy={disconnecting === conn.id}
          disabled={busy}
          onPress={() => disconnect(conn)}
        />
      </View>
    </View>
  );
}

export function MailboxesSection() {
  const { data, providers, canAdd, connect, connecting } = useMailboxes();
  if (!data) return null;
  const connections = data.connections;
  if (providers.length === 0 && connections.length === 0) return null;

  const atLimit = connections.length >= data.limit;
  const note = atLimit
    ? fill(s.mailboxes.atLimit, { limit: data.limit })
    : connections.length > 0
      ? s.mailboxes.noteConnected
      : s.mailboxes.note;

  return (
    <Section title={s.mailboxes.title} note={note}>
      {connections.length > 0 ? (
        <Group>
          {connections.map((conn, i) => (
            <MailboxRow key={conn.id} conn={conn} first={i === 0} />
          ))}
        </Group>
      ) : null}
      <Group>
        {canAdd && connections.length === 0
          ? providers.map((p, i) => (
              <Row
                key={p}
                first={i === 0}
                label={p === "google" ? s.mailboxes.connectGoogle : s.mailboxes.connectMicrosoft}
                accessibilityHint={s.mailboxes.connectHint}
                busy={connecting === p}
                disabled={connecting != null}
                onPress={() => connect(p)}
              />
            ))
          : null}
        {canAdd && connections.length > 0 ? (
          <Row
            first
            label={s.mailboxes.addAnother}
            accessibilityHint={s.mailboxes.connectHint}
            busy={connecting != null && !connections.some((c) => c.status !== "active" && c.provider === connecting)}
            disabled={connecting != null}
            onPress={() => connect()}
          />
        ) : null}
        <Row
          first={!canAdd}
          label={s.mailboxes.forwardInstead}
          detail={s.mailboxes.forwardInsteadNote}
          onPress={() => router.push("/account/forwarding")}
        />
      </Group>
    </Section>
  );
}

const useStyles = makeStyles((colors) => ({
  mailbox: { paddingVertical: space.md, paddingHorizontal: 14, gap: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  texts: { gap: 2 },
  buttons: { flexDirection: "row", gap: space.sm },
  small: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  smallLabel: { fontFamily: fonts.semibold, fontSize: 15 },
  inactive: { opacity: 0.45 },
}));
