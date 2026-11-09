// One receipt, as a paper receipt: perforated top, the amount large in mono,
// then the details. Read-only for now; editing and confirming come with the
// scanner (docs/plans/unreceipt-ios-native-plan.md, phase 2).

import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { Money } from "../../../../components/Money";
import { PerfEdge } from "../../../../components/PerfEdge";
import { missingFields } from "../../../../components/ReceiptRow";
import { Text } from "../../../../components/Text";
import { fill, locale, s } from "../../../../i18n";
import { formatMoney, longDate, parseReceiptDate } from "../../../../lib/format";
import { useHome } from "../../../../lib/HomeProvider";
import { colors, radius, space } from "../../../../theme";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color={colors.inkFaint}>
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
  const foreign = r.homeCurrency && r.homeCurrency !== r.currency && r.homeTotal != null;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Animated.View entering={FadeIn.duration(320)}>
        <PerfEdge color={colors.card} background={colors.surface} />
        <View style={styles.card}>
          <Text variant="bodyLg" numberOfLines={2} color={r.merchant ? colors.ink : colors.inkFaint}>
            {r.merchant ?? "—"}
          </Text>
          <View style={styles.total}>
            <Money amount={r.total} currency={r.currency} size="display" />
            {foreign && r.homeCurrency && r.homeTotal != null ? (
              <Text variant="amountRow" color={colors.inkFaint}>
                ≈ {formatMoney(r.homeTotal, r.homeCurrency, locale)} ·{" "}
                {r.fxSource === "manual" ? s.detail.bankAmount : s.detail.ecbEstimate}
              </Text>
            ) : null}
          </View>

          <View
            style={[styles.status, review ? styles.statusReview : styles.statusDone]}
            accessibilityLiveRegion="polite"
          >
            <Text
              variant="caption"
              style={styles.statusText}
              color={missing ? colors.negative : review ? colors.attentionDeep : colors.brandAction}
            >
              {missing
                ? fill(s.detail.statusMissing, { fields: missing })
                : review
                  ? s.detail.statusToConfirm
                  : s.detail.statusDone}
            </Text>
          </View>

          <View style={styles.divider} />
          <Row label={s.detail.date} value={date ? longDate(date, locale) : "—"} />
          <Row label={s.detail.category} value={s.categories[r.category]} />
          <Row label={s.detail.source} value={s.detail.sources[r.source]} />
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl },
  card: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  total: { gap: 4, marginTop: space.xs },
  status: { borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md },
  statusReview: { backgroundColor: colors.attentionTint },
  statusDone: { backgroundColor: colors.brandTint },
  statusText: { fontFamily: "Manrope_600SemiBold" },
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
