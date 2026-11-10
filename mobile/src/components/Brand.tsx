// The UnReceipt isotype (same geometry as src/app/icon2.svg) and wordmark:
// "Un" in Deep Space + "Receipt" in Green Mint, Manrope ExtraBold (DESIGN.md).

import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors, fonts } from "../theme";
import { Text } from "./Text";

/**
 * `tile`: the app icon (navy tile). `bare`: the glyph alone for the mint
 * empty-state square, as the website's on-mint isotype (cream receipt with a
 * navy outline, green lines, navy arrow). Decorative unless `label` is given.
 */
export function BrandMark({
  size = 56,
  variant = "tile",
  label,
}: {
  size?: number;
  variant?: "tile" | "bare";
  label?: string;
}) {
  const tile = variant === "tile";
  const arrow = tile ? colors.brand : colors.ink;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={tile ? "0 0 100 100" : "19 19 62 62"}
      accessible={Boolean(label)}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
    >
      {tile ? <Rect width={100} height={100} rx={22} fill={colors.ink} /> : null}
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z"
        fill={colors.surface}
        stroke={tile ? undefined : colors.ink}
        strokeWidth={tile ? undefined : 1.5}
        strokeLinejoin="round"
      />
      {[
        [36, 22, 14],
        [33, 29, 20],
        [33, 36, 17],
        [33, 43, 14],
      ].map(([x, y, w]) => (
        <Rect
          key={y}
          transform="translate(19 19) scale(0.96875)"
          x={x}
          y={y}
          width={w}
          height={2.6}
          rx={1.3}
          fill={colors.brand}
        />
      ))}
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M30 26 A12 12 0 1 1 23 11"
        stroke={arrow}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M19.5 11 L25.5 7.5 L25.5 14.5 Z"
        fill={arrow}
      />
    </Svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="UnReceipt">
      <Text style={[styles.word, { fontSize: size, letterSpacing: -0.02 * size }]} color={colors.ink}>
        Un
      </Text>
      <Text style={[styles.word, { fontSize: size, letterSpacing: -0.02 * size }]} color={colors.brand}>
        Receipt
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  word: { fontFamily: fonts.extrabold },
});
