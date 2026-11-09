// One receipt in the list (DESIGN.md "Receipt list item"): initials block,
// merchant, "Category · date", the amount in mono; a honey rule on the left
// when it needs the user.

import { StyleSheet, View } from "react-native";
import type { MobileReceipt } from "@/lib/mobile/types";
import { fill, joinList, locale, s } from "../i18n";
import { formatMoney, parseReceiptDate, shortDate } from "../lib/format";
import { getMerchantColor, getMerchantInitials } from "../lib/merchant";
import { colors, fonts, radius, space } from "../theme";
import { Money } from "./Money";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/** "amount and date", or null when nothing is missing. */
export function missingFields(r: MobileReceipt): string | null {
  if (r.missing.length === 0) return null;
  // In the order the form shows them.
  const order = ["merchant", "total", "purchased_at"] as const;
  return joinList(
    order.filter((f) => r.missing.includes(f)).map((f) => s.fields[f]),
    s.fields.and,
  );
}

/** "Missing amount and date", or null. */
export function missingText(r: MobileReceipt): string | null {
  const fields = missingFields(r);
  return fields ? fill(s.receipts.missing, { fields }) : null;
}

/** The converted amount of a foreign receipt, or null. */
export function convertedAmount(r: MobileReceipt): string | null {
  if (!r.homeCurrency || r.homeCurrency === r.currency || r.homeTotal == null) return null;
  return fill(s.receipts.estimate, { amount: formatMoney(r.homeTotal, r.homeCurrency, locale) });
}

export function ReceiptRow({ receipt: r, onPress }: { receipt: MobileReceipt; onPress: () => void }) {
  const date = parseReceiptDate(r.date);
  const missing = missingText(r);
  const review = r.status === "pending_review";
  const converted = convertedAmount(r);
  const meta = [s.categories[r.category], date ? shortDate(date, locale) : null].filter(Boolean).join(" · ");

  // Everything a sighted person reads on the card, in reading order.
  const label = [
    r.merchant ?? "—",
    r.total != null ? formatMoney(r.total, r.currency, locale) : null,
    converted,
    review ? (missing ?? s.receipts.toConfirm) : null,
    meta,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PressableScale
      onPress={onPress}
      // Like a native table cell: a touch that starts a scroll doesn't
      // shrink the card.
      unstable_pressDelay={90}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.card, review && styles.review]}
    >
      <View style={[styles.block, { backgroundColor: getMerchantColor(r.merchant) }]}>
        <Text style={styles.initials} color={colors.white}>
          {getMerchantInitials(r.merchant)}
        </Text>
      </View>
      <View style={styles.middle}>
        <Text variant="merchant" numberOfLines={1} color={r.merchant ? colors.ink : colors.inkFaint}>
          {r.merchant ?? "—"}
        </Text>
        <Text variant="caption" numberOfLines={1} color={colors.inkMuted}>
          {review ? (
            <Text
              variant="caption"
              style={styles.flag}
              color={missing ? colors.negative : colors.attentionDeep}
            >
              {missing ?? s.receipts.toConfirm}
              {" · "}
            </Text>
          ) : null}
          {meta}
        </Text>
      </View>
      <View style={styles.right}>
        <Money amount={r.total} currency={r.currency} />
        {converted ? (
          <Text variant="amountRow" color={colors.inkMuted} numberOfLines={1}>
            {converted}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  review: { borderLeftWidth: 3, borderLeftColor: colors.attention },
  block: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontFamily: fonts.bold, fontSize: 14 },
  middle: { flex: 1, gap: 2 },
  flag: { fontFamily: fonts.semibold },
  right: { alignItems: "flex-end", gap: 2, maxWidth: "45%" },
});
