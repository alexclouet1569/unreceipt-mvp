// The "Original" side of the receipt screen (DESIGN.md, native app): what
// the receipt was made from, without leaving the app.
//
//   photo  → the picture on Deep Space (460 pt, contain); tap for the viewer.
//   PDF    → every page shown (up to 10) as a picture the server drew, on
//            white like paper; tap a page for the viewer (pinch to zoom,
//            scroll through every page).
//   email  → From, Subject and Date, then the email's words: plain text the
//            server cut from it, never its HTML (no scripts, tracking
//            pixels or remote images can reach the phone).
//   text   → the text message.
//
// Nothing here opens or interprets the file itself; "Original" in the
// actions below still saves or sends the file as it was received.

import { useEffect } from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { MobileReceipt, OriginalPreview } from "@/lib/mobile/types";
import { fill, s } from "../i18n";
import { photoCacheKey, useOriginalPreview, useReceiptPhoto, type OriginalPage } from "../lib/original";
import { Button } from "./Button";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { durations, fonts, radius, space, makeStyles, useColors } from "../theme";

/** A frame that breathes while its picture or text loads (as the list's placeholders). */
function Placeholder({ height }: { height: number }) {
  const styles = useStyles();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: durations.long, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.placeholder, { height }, pulse]} />;
}

function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.card}>
      <Text variant="body" color={colors.inkMuted} style={styles.centered}>
        {message}
      </Text>
      {onRetry ? <Button label={s.common.retry} kind="outline" onPress={onRetry} /> : null}
    </View>
  );
}

/** Under a PDF, email or text message: the view is a copy, the file is the original. */
function CopyNote({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Text variant="caption" color={colors.inkMuted}>
      {text}
    </Text>
  );
}

function PhotoOriginal({ id, photoRoute }: { id: string; photoRoute: string }) {
  const styles = useStyles();
  const photo = useReceiptPhoto(id, true);
  if (photo.failed) return <Failed message={s.detail.originalFailed} />;
  return (
    <PressableScale
      scaleTo={0.985}
      disabled={!photo.url}
      onPress={() => router.push({ pathname: photoRoute as "/receipt/photo", params: { id } })}
      accessibilityRole="imagebutton"
      accessibilityLabel={s.edit.photo}
      accessibilityHint={s.detail.originalZoomHint}
      style={styles.photoFrame}
    >
      {photo.url ? (
        <Image
          source={{ uri: photo.url, cacheKey: photoCacheKey(id) }}
          style={styles.fill}
          contentFit="contain"
          transition={durations.short}
        />
      ) : (
        <Placeholder height={460} />
      )}
    </PressableScale>
  );
}

function PdfPages({
  id,
  pages,
  total,
  photoRoute,
}: {
  id: string;
  pages: OriginalPage[];
  total: number;
  photoRoute: string;
}) {
  const styles = useStyles();
  const { width: screen } = useWindowDimensions();
  // The content's width: the screen less the page padding (space.lg each side).
  const width = screen - space.lg * 2;
  if (pages.length === 0) return <Failed message={s.detail.originalUnavailable} />;
  return (
    <View style={styles.pages}>
      {pages.map((p) => {
        const label = fill(s.detail.originalPage, { page: p.page, total });
        return (
          <PressableScale
            key={p.page}
            scaleTo={0.985}
            onPress={() => router.push({ pathname: photoRoute as "/receipt/photo", params: { id, page: String(p.page) } })}
            accessibilityRole="imagebutton"
            accessibilityLabel={label}
            accessibilityHint={s.detail.originalZoomHint}
            style={[styles.page, { height: Math.round((width * p.height) / Math.max(p.width, 1)) }]}
          >
            <Image source={p.source} style={styles.fill} contentFit="contain" transition={durations.short} />
          </PressableScale>
        );
      })}
      <CopyNote
        text={total > pages.length ? fill(s.detail.originalMorePages, { shown: pages.length, total }) : s.detail.originalPdfCopy}
      />
    </View>
  );
}

function EmailOriginal({ preview }: { preview: Extract<OriginalPreview, { type: "eml" }> }) {
  const styles = useStyles();
  const colors = useColors();
  // The Date header as written: shown in the viewer's time zone it could
  // read as another day.
  const rows: [string, string | null][] = [
    [s.detail.originalFrom, preview.from],
    [s.detail.originalTo, preview.to],
    [s.detail.originalSubject, preview.subject],
    [s.detail.originalDate, preview.date],
  ];
  return (
    <View style={styles.stack}>
      <View style={styles.emailCard}>
        <View style={styles.headers}>
          {rows.map(([label, value]) =>
            value ? (
              <View key={label} style={styles.headerRow}>
                <Text variant="caption" style={styles.headerLabel} color={colors.inkMuted}>
                  {label}
                </Text>
                <Text variant="caption" style={styles.headerValue} selectable>
                  {value}
                </Text>
              </View>
            ) : null,
          )}
        </View>
        <Text variant="body" style={styles.emailText} selectable>
          {preview.text || s.detail.originalNoText}
        </Text>
      </View>
      <CopyNote text={preview.truncated ? s.detail.originalTruncated : s.detail.originalEmailCopy} />
    </View>
  );
}

export function OriginalView({ receipt, photoRoute }: { receipt: MobileReceipt; photoRoute: string }) {
  const styles = useStyles();
  const colors = useColors();
  const isPhoto = receipt.original === "image";
  const { state, retry } = useOriginalPreview(receipt.id, !isPhoto && receipt.original != null);

  if (isPhoto) return <PhotoOriginal id={receipt.id} photoRoute={photoRoute} />;
  if (state.status === "loading") return <Placeholder height={receipt.original === "pdf" ? 460 : 240} />;
  if (state.status === "failed") return <Failed message={s.detail.originalFailed} onRetry={retry} />;

  const { preview, pages } = state;
  switch (preview.type) {
    case "pdf":
      return <PdfPages id={receipt.id} pages={pages} total={preview.total} photoRoute={photoRoute} />;
    case "eml":
      return <EmailOriginal preview={preview} />;
    case "txt":
      return (
        <View style={styles.stack}>
          <View style={styles.emailCard}>
            <Text variant="body" style={styles.emailText} selectable>
              {preview.body || s.detail.originalNoText}
            </Text>
          </View>
          <CopyNote text={preview.truncated ? s.detail.originalTextTruncated : s.detail.originalTextCopy} />
        </View>
      );
    default:
      return (
        <View style={styles.card}>
          <Text variant="body" color={colors.inkMuted} style={styles.centered}>
            {s.detail.originalUnavailable}
          </Text>
        </View>
      );
  }
}

const useStyles = makeStyles((colors) => ({
  fill: { flex: 1 },
  placeholder: { borderRadius: radius.lg, backgroundColor: colors.skeleton },
  photoFrame: {
    height: 460,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.photoGround,
    overflow: "hidden",
  },
  pages: { gap: space.md },
  // A page is a picture of a document: white like paper in dark mode too
  // (as the receipt PDF, DESIGN.md).
  page: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  stack: { gap: space.sm },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  centered: { textAlign: "center" },
  emailCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  headers: {
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  headerRow: { flexDirection: "row", gap: space.md },
  // Sized to the word (it grows with Dynamic Type), at least a column wide.
  headerLabel: { minWidth: 64, fontFamily: fonts.semibold },
  headerValue: { flex: 1 },
  emailText: { paddingHorizontal: space.lg, paddingVertical: space.md },
}));
