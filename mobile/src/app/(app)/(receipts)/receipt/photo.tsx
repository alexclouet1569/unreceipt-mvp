// The receipt photo full screen on Deep Space (DESIGN.md "Photo viewer"):
// pinch to zoom up to 500 % (iOS's own scroll-view zoom), double tap to
// zoom in and back, swipe down or Close to leave. VoiceOver zooms with
// swipe up / down on the photo. The screen takes only the receipt's id and
// asks the server for the photo itself, so a link can't put another
// picture here.
//
// With `page` (a PDF original): every page the server drew, one under the
// other at the screen's width, opened at that page; scroll through them and
// pinch to zoom, as on the photo.

import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewImperativeMethods,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { PressableScale } from "../../../../components/PressableScale";
import { Text } from "../../../../components/Text";
import { fill, s } from "../../../../i18n";
import { photoCacheKey, useOriginalPreview, useReceiptPhoto } from "../../../../lib/original";
import { fonts, space, makeStyles, useColors } from "../../../../theme";

const MAX_ZOOM = 5;
const PAGE_GAP = 12;

export default function Photo() {
  const styles = useStyles();
  const colors = useColors();
  const { id, page } = useLocalSearchParams<{ id: string; page?: string }>();
  const startPage = page && /^\d{1,2}$/.test(page) ? Number(page) : null;
  const isPdf = startPage != null;
  const { url } = useReceiptPhoto(id, !isPdf);
  const { state } = useOriginalPreview(id, isPdf);
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = useWindowDimensions();
  // A PDF's pages, one under the other below the title bar.
  const pages = isPdf && state.status === "ready" ? state.pages : [];
  const top = insets.top + 60;
  const pageHeights = pages.map((p) => Math.round((width * p.height) / Math.max(p.width, 1)));
  const pageTops = pageHeights.map((_, i) => top + pageHeights.slice(0, i).reduce((a, h) => a + h + PAGE_GAP, 0));
  const height = isPdf
    ? Math.max(screenHeight, top + pageHeights.reduce((a, h) => a + h + PAGE_GAP, 0) + insets.bottom)
    : screenHeight;
  const total = isPdf && state.status === "ready" && state.preview.type === "pdf" ? state.preview.total : 0;
  const title = isPdf ? s.detail.original : s.edit.photo;
  // VoiceOver hears which page the viewer opened at.
  const label = isPdf && total > 1 ? `${title}, ${fill(s.detail.originalPage, { page: startPage, total })}` : title;
  const scroll = useRef<ScrollViewImperativeMethods>(null);
  const [zoom, setZoom] = useState(1);
  const lastTap = useRef(0);

  // Zoom to `scale` around a point of the unzoomed photo.
  const zoomTo = (scale: number, x = width / 2, y = screenHeight / 2) => {
    const w = width / scale;
    const h = height / scale;
    scroll.current?.scrollResponderZoomTo({ x: x - w / 2, y: y - h / 2, width: w, height: h, animated: true });
  };

  const onTap = (x: number, y: number) => {
    const now = Date.now();
    if (now - lastTap.current < 280) zoomTo(zoom > 1.01 ? 1 : 2.5, x, y);
    lastTap.current = now;
  };

  const step = (direction: 1 | -1) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, Math.round(zoom) + direction));
    zoomTo(next);
    AccessibilityInfo.announceForAccessibility(`${next * 100} %`);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroll as never}
        maximumZoomScale={MAX_ZOOM}
        minimumZoomScale={1}
        centerContent={!isPdf}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={isPdf}
        // Opened at the page that was tapped (once its size is known).
        key={pages.length > 0 ? "pages" : "loading"}
        contentOffset={startPage != null && pageTops[startPage - 1] != null ? { x: 0, y: pageTops[startPage - 1] - top } : undefined}
        onScroll={(e) => setZoom(e.nativeEvent.zoomScale ?? 1)}
        scrollEventThrottle={64}
        contentContainerStyle={{ width, height }}
      >
        <Pressable
          onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: `${Math.round(zoom * 100)} %` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        >
          {isPdf ? (
            <View style={{ width, height }}>
              {pages.map((p, i) => (
                <Image
                  key={p.page}
                  source={p.source}
                  style={[styles.page, { top: pageTops[i], width, height: pageHeights[i] }]}
                  contentFit="contain"
                  transition={200}
                />
              ))}
            </View>
          ) : url ? (
            <Image
              source={{ uri: url, cacheKey: photoCacheKey(id) }}
              style={{ width, height }}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <View style={{ width, height }} />
          )}
        </Pressable>
      </ScrollView>
      <SafeAreaView style={styles.bar} edges={["top"]} pointerEvents="box-none">
        <Text style={styles.title} color={colors.white}>
          {title}
        </Text>
        <PressableScale
          scaleTo={0.9}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={s.edit.close}
          style={styles.close}
        >
          <SymbolView name="xmark" size={17} tintColor={colors.white} weight="semibold" />
        </PressableScale>
      </SafeAreaView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.photoGround },
  // A PDF page is a picture of paper: white in dark mode too.
  page: { position: "absolute", left: 0, backgroundColor: "#FFFFFF" },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 15,
    // Readable over a white receipt slid under it while zoomed.
    textShadowColor: colors.photoGround,
    textShadowRadius: 6,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.inkScrim,
    alignItems: "center",
    justifyContent: "center",
  },
}));
