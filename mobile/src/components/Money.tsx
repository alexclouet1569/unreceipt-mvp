// An amount in Geist Mono with the currency set smaller (DESIGN.md "Mono
// amounts everywhere"). Never wraps: a long amount on the detail steps down
// in size instead, as on the website.

import { StyleSheet, View } from "react-native";
import { locale } from "../i18n";
import { moneyParts } from "../lib/format";
import { type, useColors } from "../theme";
import { Text } from "./Text";

type Size = "row" | "card" | "display";

const VALUE = { row: type.amountRow, card: type.amountXl, display: type.amountDisplay } as const;
const CURRENCY_SIZE: Record<Size, number> = { row: 11, card: 11, display: 13 };

/** DESIGN.md "Digital receipt": 40, then 32 and 26 for long amounts. */
function displaySize(text: string): number {
  if (text.length > 12) return 26;
  if (text.length > 9) return 32;
  return 40;
}

export function Money({
  amount,
  currency,
  size = "card",
  color: colorProp,
  fit = false,
  sizeFor,
}: {
  amount: number | null;
  currency: string;
  size?: Size;
  color?: string;
  /** In a narrow box: the digits shrink a little instead of being cut. */
  fit?: boolean;
  /** Display size: step down by this amount instead of `amount` (a rolling number keeps one size). */
  sizeFor?: number;
}) {
  const colors = useColors();
  const color = colorProp ?? colors.ink;
  const base = VALUE[size];
  if (amount == null) {
    return (
      <Text style={base} color={colors.inkFaint}>
        —
      </Text>
    );
  }
  const p = moneyParts(amount, currency, locale);
  const px = displaySize(sizeFor != null ? moneyParts(sizeFor, currency, locale).value : p.value);
  const value = size === "display" ? { ...base, fontSize: px, lineHeight: px * 1.05, letterSpacing: -0.02 * px } : base;
  const small = { fontFamily: base.fontFamily, fontSize: CURRENCY_SIZE[size] };
  // Already large on the detail: grow less with the user's text size; in a
  // narrow box (fit) too, so the digits stay whole.
  const scale = size === "display" ? 1.1 : fit ? 1.2 : 1.4;
  // A narrow box steps long amounts down to 12 pt, as the website's stat card.
  const fitted =
    fit && `${p.prefix}${p.value}${p.suffix}`.length > 11 ? { fontSize: 12, lineHeight: 18 } : null;

  return (
    <View style={styles.row} accessible accessibilityLabel={`${p.prefix}${p.value} ${p.suffix}`.trim()}>
      {p.prefix ? (
        <Text style={[small, styles.prefix]} color={colors.inkMuted} maxFontSizeMultiplier={scale}>
          {p.prefix}
        </Text>
      ) : null}
      <Text
        style={[value, fitted, styles.tabular, fit && styles.shrink]}
        color={color}
        numberOfLines={1}
        adjustsFontSizeToFit={fit}
        minimumFontScale={fit ? 0.75 : undefined}
        maxFontSizeMultiplier={scale}
      >
        {p.value}
      </Text>
      {p.suffix ? (
        <Text style={[small, styles.suffix]} color={colors.inkMuted} maxFontSizeMultiplier={scale}>
          {p.suffix}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline", flexShrink: 1 },
  tabular: { fontVariant: ["tabular-nums"] },
  shrink: { flexShrink: 1 },
  prefix: { marginRight: 1 },
  suffix: { marginLeft: 3 },
});
