// A sentence with some words set strong (the guide's quoted button names).

import type { TextProps } from "react-native";
import type { Piece } from "../lib/forwarding-guide";
import { colors, fonts } from "../theme";
import { Text } from "./Text";

export function RichText({
  pieces,
  variant = "bodyLg",
  color = colors.ink,
  ...rest
}: { pieces: Piece[]; variant?: "bodyLg" | "body" | "caption"; color?: string } & TextProps) {
  return (
    <Text variant={variant} color={color} {...rest}>
      {pieces.map((p, i) =>
        p.strong ? (
          <Text key={i} variant={variant} color={color} style={{ fontFamily: fonts.bold }}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}
