// "Your firm's link" (accounting firm staff): the QR code to show a client
// at a meeting, and the link to share (iOS's share sheet) or copy. The
// client opens it, signs in and says yes (/app/connect/<code>; see the
// website's src/lib/firm/join-link.ts). The QR code is a picture drawn by
// the server (no QR library on the phone); white like paper in dark mode
// too. Making a new link or turning it off stays on the website (admins).

import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, ScrollView, Share, View } from "react-native";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Button } from "../../../components/Button";
import { GroupedSkeleton } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { s } from "../../../i18n";
import { useFirm } from "../../../lib/FirmProvider";
import { radius, space, makeStyles, useColors } from "../../../theme";

export default function FirmLink() {
  const styles = useStyles();
  const colors = useColors();
  const { firm, error } = useFirm();
  const link = firm?.joinLink ?? null;
  // "Link copied" on the button for a moment, as the forwarding address.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link.url);
    setCopied(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(s.firm.copied);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="displayLg" accessibilityRole="header">
        {s.firm.link}
      </Text>
      <Text variant="body" color={colors.inkMuted}>
        {s.firm.linkBody}
      </Text>
      {link ? (
        <>
          {link.qr ? (
            <View style={styles.qrFrame}>
              <Image
                source={{ uri: link.qr }}
                style={styles.qr}
                contentFit="contain"
                accessible
                accessibilityRole="image"
                accessibilityLabel={s.firm.linkQr}
              />
            </View>
          ) : null}
          <Text variant="caption" color={colors.ink} selectable style={styles.url}>
            {link.url}
          </Text>
          <Button
            label={s.firm.share}
            kind="ink"
            // iOS shares the link itself (AirDrop, Messages…); a message would send it twice.
            onPress={() => void Share.share(Platform.OS === "ios" ? { url: link.url } : { message: link.url }).catch(() => {})}
          />
          <Button label={copied ? s.firm.copied : s.firm.copy} kind="outline" onPress={() => void copy()} />
        </>
      ) : firm ? (
        <Text variant="body" color={colors.ink}>
          {s.firm.linkOff}
        </Text>
      ) : error ? (
        <Text variant="body" color={colors.attentionDeep}>
          {error === "offline" ? s.common.unreachable : s.firm.loadFailed}
        </Text>
      ) : (
        <GroupedSkeleton groups={[1]} bare />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: space.lg, paddingTop: space.xl, gap: space.md },
  qrFrame: {
    alignSelf: "center",
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    // A picture of a link: white like paper in both modes.
    backgroundColor: colors.white,
  },
  qr: { width: 220, height: 220 },
  url: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
}));
