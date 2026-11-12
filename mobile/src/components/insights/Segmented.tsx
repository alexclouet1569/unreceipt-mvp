// A row of options on a cream track, the chosen one on a white thumb that
// glides to the option you tap (a spring on the UI thread, like iOS's own
// segmented control), the labels fading between ink and muted as it passes.
// Used for Month / Quarter / Year / Dates and By date / By category.

import { useEffect, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { fonts, radius, space, springs, makeStyles, useColors } from "../../theme";
import { PressableScale } from "../PressableScale";

const PAD = 4;
const BORDER = 1;

function Label({ text, index, position, active }: { text: string; index: number; position: SharedValue<number>; active: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const ink = colors.ink;
  const muted = colors.inkMuted;
  const color = useAnimatedStyle(() => {
    const away = Math.min(1, Math.abs(position.value - index));
    return { color: interpolateColor(away, [0, 1], [ink, muted]) };
  });
  return (
    <Animated.Text
      style={[styles.label, { color: active ? ink : muted }, color]}
      numberOfLines={1}
      adjustsFontSizeToFit
      maxFontSizeMultiplier={1.4}
    >
      {text}
    </Animated.Text>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  /** Called on every tap, the chosen option included (Dates opens its sheet again). */
  onChange: (value: T) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const position = useSharedValue(index);
  const slot = useSharedValue(0);

  useEffect(() => {
    position.value = reduceMotion ? index : withSpring(index, springs.settle);
  }, [index, reduceMotion, position]);
  useEffect(() => {
    slot.value = width > 0 ? (width - 2 * BORDER - 2 * PAD) / options.length : 0;
  }, [width, options.length, slot]);

  const thumb = useAnimatedStyle(() => ({
    width: slot.value,
    opacity: slot.value > 0 ? 1 : 0,
    transform: [{ translateX: position.value * slot.value }],
  }));

  return (
    <View
      style={[styles.track, style]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.thumb, thumb]} pointerEvents="none" />
      {options.map((o, i) => {
        const active = i === index;
        return (
          <PressableScale
            key={o.value}
            scaleTo={0.95}
            onPress={() => {
              if (!active) void Haptics.selectionAsync();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={styles.option}
          >
            <Label text={o.label} index={i} position={position} active={active} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  track: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: PAD,
    borderRadius: radius.md,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  // Positioned inside the border, from the padding's edge.
  thumb: {
    position: "absolute",
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  option: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
}));
