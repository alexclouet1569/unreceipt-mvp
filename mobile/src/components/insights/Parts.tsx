// A sentence whose amounts are set in Geist Mono and words in Manrope
// (DESIGN.md "Mono amounts everywhere"), one Text so it wraps as one line.

import type { TextProps } from "react-native";
import type { Part } from "../../lib/insights";
import { colors } from "../../theme";
import { Text } from "../Text";

export function Parts({
  parts,
  color = colors.inkMuted,
  amountColor = colors.ink,
  ...rest
}: { parts: Part[]; color?: string; amountColor?: string } & Omit<TextProps, "children">) {
  return (
    <Text variant="caption" color={color} {...rest}>
      {parts.map((p, i) =>
        p.money ? (
          <Text key={i} variant="amountRow" color={amountColor} style={{ fontSize: 13, lineHeight: 18 }}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}
