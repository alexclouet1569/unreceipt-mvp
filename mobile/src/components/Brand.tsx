// The UnReceipt isotype (same geometry as src/app/icon2.svg) and wordmark:
// "Un" in Deep Space + "Receipt" in Green Mint, Manrope ExtraBold (DESIGN.md).

import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors, fonts } from "../theme";
import { Text } from "./Text";

export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="UnReceipt">
      <Rect width={100} height={100} rx={22} fill={colors.ink} />
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z"
        fill={colors.surface}
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
        stroke={colors.brand}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M19.5 11 L25.5 7.5 L25.5 14.5 Z"
        fill={colors.brand}
      />
    </Svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="UnReceipt">
      <Text style={[styles.word, { fontSize: size }]} color={colors.ink}>
        Un
      </Text>
      <Text style={[styles.word, { fontSize: size }]} color={colors.brand}>
        Receipt
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  word: { fontFamily: fonts.extrabold, letterSpacing: -0.5 },
});
