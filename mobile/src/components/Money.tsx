// An amount in Geist Mono with the currency set smaller and fainter
// (DESIGN.md "Mono amounts everywhere").

import { StyleSheet, View } from "react-native";
import { locale } from "../i18n";
import { moneyParts } from "../lib/format";
import { colors, fonts } from "../theme";
import { Text } from "./Text";

type Size = "row" | "card" | "display";

const SIZES: Record<Size, { value: number; currency: number }> = {
  row: { value: 14, currency: 11 },
  card: { value: 18, currency: 11 },
  display: { value: 40, currency: 18 },
};

export function Money({
  amount,
  currency,
  size = "card",
  color = colors.ink,
}: {
  amount: number | null;
  currency: string;
  size?: Size;
  color?: string;
}) {
  const s = SIZES[size];
  if (amount == null) {
    return (
      <Text style={{ fontFamily: fonts.mono, fontSize: s.value }} color={colors.inkFaint}>
        —
      </Text>
    );
  }
  const p = moneyParts(amount, currency, locale);
  const value = { fontFamily: fonts.mono, fontSize: s.value, letterSpacing: -0.02 * s.value };
  const small = { fontFamily: fonts.mono, fontSize: s.currency };
  return (
    <View style={styles.row} accessible accessibilityLabel={`${p.prefix}${p.value} ${p.suffix}`.trim()}>
      {p.prefix ? (
        <Text style={[small, styles.prefix]} color={colors.inkFaint}>
          {p.prefix}
        </Text>
      ) : null}
      <Text style={[value, { fontVariant: ["tabular-nums"] }]} color={color}>
        {p.value}
      </Text>
      {p.suffix ? (
        <Text style={[small, styles.suffix]} color={colors.inkFaint}>
          {p.suffix}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline" },
  prefix: { marginRight: 1 },
  suffix: { marginLeft: 3 },
});
