// The receipt photo full screen on Deep Space (DESIGN.md "Photo viewer"):
// pinch to zoom up to 500 % (iOS's own scroll-view zoom), double tap to
// zoom in and back, swipe down or Close to leave.

import { useRef, useState } from "react";
import {
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
import { photoCacheKey } from "../../../../lib/original";
import { colors, fonts, radius, space } from "../../../../theme";

export default function Photo() {
  const { id, url } = useLocalSearchParams<{ id: string; url: string }>();
  const { width, height } = useWindowDimensions();
  const scroll = useRef<ScrollViewImperativeMethods>(null);
  const [zoomed, setZoomed] = useState(false);
  const lastTap = useRef(0);

  const onTap = (x: number, y: number) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (zoomed) scroll.current?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
      else scroll.current?.scrollResponderZoomTo({ x: x - width / 5, y: y - height / 5, width: width / 2.5, height: height / 2.5, animated: true });
    }
    lastTap.current = now;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroll as never}
        maximumZoomScale={5}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setZoomed((e.nativeEvent.zoomScale ?? 1) > 1.01)}
        scrollEventThrottle={64}
        contentContainerStyle={{ width, height }}
      >
        <Pressable onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessible={false}>
          <Image
            source={{ uri: url, cacheKey: id ? photoCacheKey(id) : undefined }}
            style={{ width, height }}
            contentFit="contain"
            accessibilityLabel={s.edit.photo}
          />
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
          <SymbolView name="xmark" size={18} tintColor={colors.white} weight="semibold" />
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
  },
  title: { fontFamily: fonts.bold, fontSize: 15 },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
