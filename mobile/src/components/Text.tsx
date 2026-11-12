import { Text as RNText, type TextProps } from "react-native";
import { type as typeScale, useColors } from "../theme";

type Variant = keyof typeof typeScale;

export function Text({
  variant = "body",
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  const colors = useColors();
  return (
    <RNText
      // Respect the user's text size, but keep the layout intact.
      maxFontSizeMultiplier={1.4}
      style={[typeScale[variant], { color: color ?? colors.ink }, style]}
      {...rest}
    />
  );
}
