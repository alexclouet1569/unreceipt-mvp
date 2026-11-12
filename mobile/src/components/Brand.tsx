// The UnReceipt isotype (same geometry as src/app/icon2.svg) and wordmark:
// "Un" in Deep Space + "Receipt" in Green Mint, Manrope ExtraBold (DESIGN.md).
// On the dark palette both follow the brand book's on-dark set: cream
// receipt with green lines and arrow, a single-colour cream wordmark.

import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { fonts, lightColors, useColors, useScheme } from "../theme";
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
  /** light: the website's header mark (green receipt, cream lines, navy arrow), no tile. */
  variant?: "tile" | "bare" | "light";
  label?: string;
}) {
  const colors = useColors();
  const onDark = useScheme() === "dark";
  // One colour set per mark (DESIGN.md "Dark mode"):
  // - tile: the app icon, the same in both modes (navy tile, cream receipt,
  //   green lines and arrow), like the splash before it;
  // - on dark, the header and bare marks use the brand book's on-dark set:
  //   cream receipt (ink is cream there), green lines and arrow;
  // - on light, the header mark is a green receipt with cream lines and a
  //   navy arrow, the bare mark a cream receipt with a navy outline.
  const tile = variant === "tile";
  const set = tile
    ? { tile: lightColors.ink, receipt: lightColors.surface, stroke: undefined, lines: colors.brand, arrow: colors.brand }
    : onDark
      ? { tile: undefined, receipt: colors.ink, stroke: undefined, lines: colors.brand, arrow: colors.brand }
      : variant === "light"
        ? { tile: undefined, receipt: colors.brand, stroke: undefined, lines: colors.surface, arrow: colors.ink }
        : { tile: undefined, receipt: colors.surface, stroke: colors.ink, lines: colors.brand, arrow: colors.ink };
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
      {set.tile ? <Rect width={100} height={100} rx={22} fill={set.tile} /> : null}
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z"
        fill={set.receipt}
        stroke={set.stroke}
        strokeWidth={set.stroke ? 1.5 : undefined}
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
          fill={set.lines}
        />
      ))}
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M30 26 A12 12 0 1 1 23 11"
        stroke={set.arrow}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        transform="translate(19 19) scale(0.96875)"
        d="M19.5 11 L25.5 7.5 L25.5 14.5 Z"
        fill={set.arrow}
      />
    </Svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  const colors = useColors();
  // Brand book on dark: one cream colour for the whole word.
  const receipt = useScheme() === "dark" ? colors.ink : colors.brand;
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="UnReceipt">
      <Text style={[styles.word, { fontSize: size, letterSpacing: -0.02 * size }]} color={colors.ink}>
        Un
      </Text>
      <Text style={[styles.word, { fontSize: size, letterSpacing: -0.02 * size }]} color={receipt}>
        Receipt
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  word: { fontFamily: fonts.extrabold },
});

/** The website's header mark: the isotype next to the wordmark, for the Receipts bar. */
export function HeaderBrand() {
  return (
    <View style={headerStyles.row} accessible accessibilityRole="header" accessibilityLabel="UnReceipt">
      <BrandMark size={24} variant="light" />
      <Wordmark size={19} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
