// Account → Your email: each connected Gmail / Outlook mailbox as a row
// (its address, then the provider and its status in plain words, honey when
// it needs the user) that pushes its own screen with Reconnect and
// Disconnect (account/mailbox.tsx); the note; then one row per provider to
// connect (or "Add another mailbox"). Every other kind of email uses the
// forwarding section right below. Placeholder rows while loading; a honey
// line when the list couldn't be read. Hidden when no provider can be
// connected and nothing is.

import { useEffect, useRef } from "react";
import { AccessibilityInfo, View, findNodeHandle } from "react-native";
import { router } from "expo-router";
import { fill, locale, s } from "../i18n";
import { addRows, statusLine } from "../lib/mailboxes";
import { useMailboxes } from "../lib/MailboxesProvider";
import { space, makeStyles, useColors } from "../theme";
import { Group, Row, Section, SectionNote } from "./Grouped";
import { GroupedSkeleton } from "./Skeleton";

export function MailboxesSection() {
  const styles = useStyles();
  const colors = useColors();
  const { data, error, providers, canAdd, connect, connecting, disconnected } = useMailboxes();

  // After a disconnect (its screen has closed): VoiceOver hears which
  // mailbox went and lands on this section, not at the top of the screen.
  const headerRef = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!disconnected) return;
    const timer = setTimeout(() => {
      const node = headerRef.current ? findNodeHandle(headerRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
      AccessibilityInfo.announceForAccessibilityWithOptions(fill(s.mailboxes.disconnected, { email: disconnected.email }), {
        queue: true,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [disconnected]);

  if (!data) {
    return (
      <Section title={s.mailboxes.title} titleRef={headerRef}>
        {error ? <SectionNote text={s.mailboxes.loadFailed} color={colors.attentionDeep} /> : <GroupedSkeleton groups={[1]} bare />}
      </Section>
    );
  }
  const connections = data.connections;
  if (providers.length === 0 && connections.length === 0) return null;

  const atLimit = connections.length >= data.limit;
  const note = atLimit
    ? fill(s.mailboxes.atLimit, { limit: data.limit })
    : connections.length > 0
      ? s.mailboxes.noteConnected
      : s.mailboxes.note;
  const adds = canAdd ? addRows(providers, connections.length) : [];
  const addGroup =
    adds.length > 0 ? (
      <Group>
        {adds.map((row, i) => (
          <Row
            key={row.provider}
            first={i === 0}
            label={s.mailboxes[row.label]}
            accessibilityHint={s.mailboxes.connectHint}
            busy={connecting === row.provider}
            disabled={connecting != null}
            onPress={() => connect(row.provider)}
          />
        ))}
      </Group>
    ) : null;

  return (
    <Section title={s.mailboxes.title} titleRef={headerRef}>
      {connections.length > 0 ? (
        <>
          <Group>
            {connections.map((conn, i) => {
              const status = statusLine(conn, s.mailboxes, locale);
              const name = conn.provider === "google" ? s.mailboxes.providerGoogle : s.mailboxes.providerMicrosoft;
              return (
                <Row
                  key={conn.id}
                  first={i === 0}
                  // The address tells two Gmail accounts apart.
                  label={conn.email}
                  detail={`${name} · ${status.text}`}
                  detailColor={status.tone === "attention" ? colors.attentionDeep : undefined}
                  onPress={() => router.push({ pathname: "/account/mailbox", params: { id: conn.id } })}
                />
              );
            })}
          </Group>
          {/* The note is about the mailboxes, so it sits under them. */}
          <SectionNote text={note} />
          {addGroup ? <View style={styles.apart}>{addGroup}</View> : null}
        </>
      ) : (
        <>
          {addGroup}
          <SectionNote text={note} />
        </>
      )}
    </Section>
  );
}

const useStyles = makeStyles(() => ({
  // Below the note: a group of its own, not part of the list above.
  apart: { marginTop: space.sm },
}));
