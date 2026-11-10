// The "alive" press: anything tappable shrinks a little under the finger and
// springs back (DESIGN.md "Card tap": scale 0.985). Runs on the UI thread, so
// it answers within the same frame even while JavaScript is busy.

import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { springs } from "../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  scaleTo = 0.985,
  haptic = false,
  style,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Omit<PressableProps, "style"> & {
  scaleTo?: number;
  /** A light tap felt in the hand, for primary actions. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, springs.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, springs.press);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
    />
  );
}
