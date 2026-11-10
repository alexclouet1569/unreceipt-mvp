// The receipt photo full screen on Deep Space (DESIGN.md "Photo viewer"):
// pinch to zoom up to 500 % (iOS's own scroll-view zoom), double tap to
// zoom in and back, swipe down or Close to leave. VoiceOver zooms with
// swipe up / down on the photo. The screen takes only the receipt's id and
// asks the server for the photo itself, so a link can't put another
// picture here.

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
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { PressableScale } from "../../../../components/PressableScale";
import { Text } from "../../../../components/Text";
import { s } from "../../../../i18n";
import { photoCacheKey, useReceiptPhoto } from "../../../../lib/original";
import { colors, fonts, space } from "../../../../theme";

const MAX_ZOOM = 5;

export default function Photo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { url } = useReceiptPhoto(id, true);
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollViewImperativeMethods>(null);
  const [zoom, setZoom] = useState(1);
  const lastTap = useRef(0);

  // Zoom to `scale` around a point of the unzoomed photo.
  const zoomTo = (scale: number, x = width / 2, y = height / 2) => {
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
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setZoom(e.nativeEvent.zoomScale ?? 1)}
        scrollEventThrottle={64}
        contentContainerStyle={{ width, height }}
      >
        <Pressable
          onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={s.edit.photo}
          accessibilityValue={{ text: `${Math.round(zoom * 100)} %` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        >
          {url ? (
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
          {s.edit.photo}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
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
    textShadowColor: colors.ink,
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
});
