import { Text as RNText, type TextProps } from "react-native";
import { colors, type as typeScale } from "../theme";

type Variant = keyof typeof typeScale;

export function Text({
  variant = "body",
  color = colors.ink,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  return (
    <RNText
      // Respect the user's text size, but keep the layout intact.
      maxFontSizeMultiplier={1.4}
      style={[typeScale[variant], { color }, style]}
      {...rest}
    />
  );
}
