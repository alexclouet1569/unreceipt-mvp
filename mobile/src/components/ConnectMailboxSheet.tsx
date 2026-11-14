// The one screen of ours before Google's or Microsoft's consent screen:
// what UnReceipt reads (with a link to the privacy page's mailbox section),
// what the provider will ask, then Continue. A page sheet, swiped down or
// Cancel to close: the iOS bar (Cancel leading, "Connect Gmail" centred, as
// the delete-account sheet in StatusScreen) and Continue in a bar at the
// bottom within thumb reach, as the forwarding guide's Back / Next.

import { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  busy = false,
  onContinue,
  onCancel,
  onDismissed,
}: {
  /** The sheet shows while set. */
  provider: MailboxProvider | null;
  /** Continue was pressed: the button shows it while the sheet slides away. */
  busy?: boolean;
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
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        {/* iOS page-sheet bar: Cancel leading, the title centred. */}
        <View style={styles.header}>
          <View style={styles.side}>
            <Button label={s.common.cancel} kind="plain" onPress={onCancel} disabled={busy} />
          </View>
          <Text variant="merchant" accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <View style={styles.side} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SymbolView name="envelope" size={28} weight="semibold" tintColor={colors.ink} />
          </View>
          <Text variant="body" color={colors.inkMuted}>
            {s.mailboxes.whatWeRead}
          </Text>
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
        </ScrollView>
        <View style={styles.bar}>
          <Button label={s.mailboxes.continue} busy={busy} onPress={onContinue} />
        </View>
      </SafeAreaView>
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
  title: { flex: 1, textAlign: "center" },
  // Everything flush left, the mark included: one edge to read down.
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xl },
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
  },
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
  // The forwarding guide's bottom bar (account/guide.tsx): a hairline above, cream behind.
  bar: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
}));
