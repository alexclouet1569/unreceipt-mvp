// One receipt in the list (DESIGN.md "Receipt list item"): initials block,
// merchant, "Category · date", the amount in mono; a honey rule on the left
// when it needs the user.

import { StyleSheet, View } from "react-native";
import type { MobileReceipt } from "@/lib/mobile/types";
import { fill, joinList, locale, s } from "../i18n";
import { formatMoney, parseReceiptDate, shortDate } from "../lib/format";
import { colors, radius, space } from "../theme";
import { Money } from "./Money";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

const BLOCK_COLORS = [colors.ink, colors.brandAction, colors.attentionDeep, "#6B9778", colors.inkMuted];

function initials(name: string | null): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

function blockColor(name: string | null): string {
  let h = 0;
  for (const ch of name ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BLOCK_COLORS[h % BLOCK_COLORS.length];
}

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

export function ReceiptRow({ receipt: r, onPress }: { receipt: MobileReceipt; onPress: () => void }) {
  const date = parseReceiptDate(r.date);
  const missing = missingText(r);
  const review = r.status === "pending_review";
  const foreign =
    r.homeCurrency && r.homeCurrency !== r.currency && r.homeTotal != null ? r.homeTotal : null;

  const label = [
    r.merchant ?? "",
    r.total != null ? formatMoney(r.total, r.currency, locale) : "",
    missing ?? (review ? s.receipts.toConfirm : ""),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.card, review && styles.review]}
    >
      <View style={[styles.block, { backgroundColor: blockColor(r.merchant) }]}>
        <Text style={styles.initials} color={colors.white}>
          {initials(r.merchant)}
        </Text>
      </View>
      <View style={styles.middle}>
        <Text variant="merchant" numberOfLines={1} color={r.merchant ? colors.ink : colors.inkFaint}>
          {r.merchant ?? "—"}
        </Text>
        <Text variant="caption" numberOfLines={1} color={colors.inkFaint}>
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
          {s.categories[r.category]}
          {date ? ` · ${shortDate(date, locale)}` : ""}
        </Text>
      </View>
      <View style={styles.right}>
        <Money amount={r.total} currency={r.currency} />
        {foreign != null && r.homeCurrency ? (
          <Text variant="amountRow" color={colors.inkFaint}>
            ≈ {formatMoney(foreign, r.homeCurrency, locale)}
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
    borderWidth: StyleSheet.hairlineWidth * 2,
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
  initials: { fontFamily: "Manrope_700Bold", fontSize: 14 },
  middle: { flex: 1, gap: 2 },
  flag: { fontFamily: "Manrope_600SemiBold" },
  right: { alignItems: "flex-end", gap: 2 },
});
