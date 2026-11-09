// One receipt, as a paper receipt: perforated top, the amount large in mono,
// then the details. Read-only for now; editing and confirming come with the
// scanner (docs/plans/unreceipt-ios-native-plan.md, phase 2).

import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Money } from "../../../../components/Money";
import { PerfEdge } from "../../../../components/PerfEdge";
import { convertedAmount, missingFields } from "../../../../components/ReceiptRow";
import { Text } from "../../../../components/Text";
import { fill, locale, s } from "../../../../i18n";
import { longDate, parseReceiptDate } from "../../../../lib/format";
import { useHome } from "../../../../lib/HomeProvider";
import { colors, fonts, radius, space } from "../../../../theme";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color={colors.inkMuted}>
        {label}
      </Text>
      <Text variant="body" style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function ReceiptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { home } = useHome();
  const r = home?.state === "ready" ? home.receipts.find((x) => x.id === id) : undefined;

  if (!r) {
    return (
      <View style={styles.missingScreen}>
        <Text variant="body" color={colors.inkMuted}>
          {s.receipts.loadFailed}
        </Text>
      </View>
    );
  }

  const date = parseReceiptDate(r.date);
  const missing = missingFields(r);
  const review = r.status === "pending_review";
  const converted = convertedAmount(r);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <PerfEdge color={colors.card} background={colors.surface} />
      <View style={styles.card}>
        <Text variant="bodyLg" numberOfLines={2} color={r.merchant ? colors.ink : colors.inkFaint}>
          {r.merchant ?? "—"}
        </Text>
        <View style={styles.total}>
          <Money amount={r.total} currency={r.currency} size="display" />
          {converted ? (
            <View>
              <Text variant="amountRow" color={colors.inkMuted}>
                {converted}
              </Text>
              <Text variant="caption" color={colors.inkMuted}>
                {r.fxSource === "manual" ? s.detail.bankAmount : s.detail.ecbEstimate}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Only what needs the user is flagged; a complete receipt carries no
            stamp (DESIGN.md: mint is reserved, "verified" means checked). */}
        {missing ? (
          <Text variant="caption" style={styles.statusText} color={colors.negative}>
            {fill(s.detail.statusMissing, { fields: missing })}
          </Text>
        ) : review ? (
          <View style={styles.reviewBand}>
            <Text variant="caption" style={styles.statusText} color={colors.attentionDeep}>
              {s.detail.statusToConfirm}
            </Text>
          </View>
        ) : null}

        <View style={styles.divider} />
        <Row label={s.detail.date} value={date ? longDate(date, locale) : "—"} />
        <Row label={s.detail.category} value={s.categories[r.category]} />
        <Row label={s.detail.source} value={s.detail.sources[r.source]} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl },
  // DESIGN.md "Digital receipt": paper, a hairline border, no radius.
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.hairline,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  total: { gap: 4, marginTop: space.xs },
  reviewBand: {
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.attentionTint,
  },
  statusText: { fontFamily: fonts.semibold },
  divider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.hairline,
    marginVertical: space.xs,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.lg },
  rowValue: { flexShrink: 1, textAlign: "right" },
  missingScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
});
