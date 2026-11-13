// The one screen of ours before Google's or Microsoft's consent screen:
// what UnReceipt reads (with a link to the privacy page's mailbox section),
// what the provider will ask, then Continue. A page
// sheet, swiped down or Cancel to close (same bar as the delete-account
// sheet in StatusScreen).

import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import * as WebBrowser from "expo-web-browser";
import { PRIVACY_MAILBOX_URL } from "../config";
import { fill, s } from "../i18n";
import type { MailboxProvider } from "../lib/mailboxes";
import { fonts, radius, space, makeStyles, useColors } from "../theme";
import { Button } from "./Button";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function ConnectMailboxSheet({
  provider,
  onContinue,
  onCancel,
  onDismissed,
}: {
  /** The sheet shows while set. */
  provider: MailboxProvider | null;
  onContinue: () => void;
  onCancel: () => void;
  /** iOS: the sheet has finished sliding away. */
  onDismissed: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  // Keeps its words while it slides away.
  const [shown, setShown] = useState<MailboxProvider | null>(provider);
  useEffect(() => {
    if (provider) setShown(provider);
  }, [provider]);

  const google = shown === "google";
  const name = google ? s.mailboxes.providerGoogle : s.mailboxes.providerMicrosoft;
  const title = fill(s.mailboxes.sheetTitle, { provider: name });

  return (
    <Modal
      visible={provider != null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      onDismiss={onDismissed}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.side}>
            <Button label={s.common.cancel} kind="plain" onPress={onCancel} />
          </View>
          {/* The title is set large below; the bar only holds Cancel. */}
          <View style={styles.title} />
        </View>
        <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
          <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SymbolView name="envelope" size={28} weight="semibold" tintColor={colors.ink} />
          </View>
          <Text variant="displayLg" style={styles.center} accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body">{s.mailboxes.whatWeRead}</Text>
          {/* Like the sign-in screen's privacy link: underlined ink text. */}
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel={s.mailboxes.privacyLink}
            accessibilityHint={s.mailboxes.privacyLinkHint}
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_MAILBOX_URL)}
            style={styles.linkTarget}
          >
            <Text variant="body" color={colors.ink} style={styles.link}>
              {s.mailboxes.privacyLink}
            </Text>
          </PressableScale>
          <View style={styles.note}>
            <Text variant="caption" color={colors.inkMuted}>
              {google ? s.mailboxes.permissionGoogle : s.mailboxes.permissionMicrosoft}
            </Text>
            {google ? (
              <Text variant="caption" color={colors.inkMuted}>
                {s.mailboxes.unverifiedGoogle}
              </Text>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Button label={s.mailboxes.continue} onPress={onContinue} />
            <Button label={s.common.cancel} kind="outline" onPress={onCancel} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  sheet: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  side: { width: 110, alignItems: "flex-start" },
  title: { flex: 1 },
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  // A card-white square with a hairline: mint is kept for the empty state (DESIGN.md).
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  center: { textAlign: "center" },
  // At least 44 pt tall to tap, flush left under the text it belongs to.
  linkTarget: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: -space.sm },
  link: { fontFamily: fonts.semibold, textDecorationLine: "underline" },
  note: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actions: { gap: space.sm, marginTop: space.sm },
}));
