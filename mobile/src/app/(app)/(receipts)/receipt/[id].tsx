// One receipt, as a paper receipt: its photo, the perforated top, the amount
// large in mono, then the details. Every field opens its own bottom sheet.
// A receipt waiting for the user ends with one button: add what's missing,
// or confirm it.

import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { MobileReceipt } from "@/lib/mobile/types";
import { Button } from "../../../../components/Button";
import { Money } from "../../../../components/Money";
import { PerfEdge } from "../../../../components/PerfEdge";
import { PressableScale } from "../../../../components/PressableScale";
import { convertedAmount, missingFields } from "../../../../components/ReceiptRow";
import { Text } from "../../../../components/Text";
import { fill, locale, s } from "../../../../i18n";
import { formatMoney, longDate, parseReceiptDate } from "../../../../lib/format";
import { useReceipt } from "../../../../lib/HomeProvider";
import { useReceiptRoutes } from "../../../../lib/routes";
import { photoCacheKey, useReceiptPhoto } from "../../../../lib/original";
import { useReceiptActions } from "../../../../lib/ReceiptActions";
import { colors, durations, fonts, radius, space } from "../../../../theme";

type Field = "merchant" | "amount" | "date" | "category";

const ADD_LABEL: Record<"merchant" | "amount" | "date", () => string> = {
  merchant: () => s.edit.addMerchant,
  amount: () => s.edit.addAmount,
  date: () => s.edit.addDate,
};

function edit(path: string, id: string, field: Field) {
  router.push({ pathname: path as "/receipt/edit", params: { id, field } });
}

function Chevron() {
  return <SymbolView name="chevron.right" size={13} tintColor={colors.inkFaint} weight="semibold" />;
}

/** A detail line that opens its editor; an empty required one says "Add …" in red. */
function Row({
  label,
  value,
  addLabel,
  onPress,
}: {
  label: string;
  value: string | null;
  addLabel?: string;
  onPress: () => void;
}) {
  const shown = value ?? addLabel ?? "—";
  return (
    <PressableScale
      scaleTo={0.99}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${shown}`}
      style={styles.row}
    >
      <Text variant="caption" color={colors.inkMuted}>
        {label}
      </Text>
      <View style={styles.rowRight}>
        <Text
          variant="body"
          style={[styles.rowValue, value == null && styles.missingValue]}
          color={value == null ? colors.negative : colors.ink}
          numberOfLines={2}
        >
          {shown}
        </Text>
        <Chevron />
      </View>
    </PressableScale>
  );
}

/** The photo's frame breathes while the picture loads (as the list's placeholders). */
function PhotoPlaceholder() {
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: durations.long, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, styles.photoLoading, pulse]} />;
}

export default function ReceiptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { confirm, remove } = useReceiptActions();
  const routes = useReceiptRoutes();
  const live = useReceipt(id);
  // After Delete the row is gone while the screen slides away: keep showing
  // the last version instead of an error.
  const last = useRef<MobileReceipt | undefined>(live);
  if (live) last.current = live;
  const r = live ?? last.current;
  const photo = useReceiptPhoto(id, r?.original === "image");

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
  const fxNote = converted ? (r.fxSource === "manual" ? s.detail.bankAmount : s.detail.ecbEstimate) : null;
  const firstMissing: "merchant" | "amount" | "date" | null = r.missing.includes("merchant")
    ? "merchant"
    : r.missing.includes("total")
      ? "amount"
      : r.missing.includes("purchased_at")
        ? "date"
        : null;
  const amountLabel = [
    s.edit.amount,
    r.total != null ? formatMoney(r.total, r.currency, locale) : s.edit.addAmount,
    converted,
    fxNote,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {r.original === "image" && !photo.failed ? (
        <PressableScale
          scaleTo={0.985}
          disabled={!photo.url}
          onPress={() => router.push({ pathname: routes.photo as "/receipt/photo", params: { id: r.id } })}
          accessibilityRole="imagebutton"
          accessibilityLabel={s.edit.photo}
          style={styles.photoFrame}
        >
          {photo.url ? (
            <Image
              source={{ uri: photo.url, cacheKey: photoCacheKey(r.id) }}
              style={styles.photo}
              contentFit="cover"
              contentPosition="top"
              transition={durations.short}
            />
          ) : (
            <PhotoPlaceholder />
          )}
        </PressableScale>
      ) : null}

      <View>
        <PerfEdge color={colors.card} background={colors.surface} />
        <View style={styles.card}>
          <PressableScale
            scaleTo={0.99}
            onPress={() => edit(routes.edit, r.id, "merchant")}
            accessibilityRole="button"
            accessibilityLabel={`${s.edit.merchant}: ${r.merchant ?? s.edit.addMerchant}`}
            style={styles.tapLine}
          >
            <Text
              variant="bodyLg"
              numberOfLines={2}
              style={styles.flex}
              color={r.merchant ? colors.ink : colors.negative}
            >
              {r.merchant ?? s.edit.addMerchant}
            </Text>
            <Chevron />
          </PressableScale>

          <PressableScale
            scaleTo={0.99}
            onPress={() => edit(routes.edit, r.id, "amount")}
            accessibilityRole="button"
            accessibilityLabel={amountLabel}
            style={styles.tapLine}
          >
            <View style={styles.total}>
              {r.total != null ? (
                <Money amount={r.total} currency={r.currency} size="display" />
              ) : (
                <Text variant="bodyLg" color={colors.negative}>
                  {s.edit.addAmount}
                </Text>
              )}
              {converted ? (
                <View>
                  <Text variant="amountRow" color={colors.inkMuted}>
                    {converted}
                  </Text>
                  <Text variant="caption" color={colors.inkMuted}>
                    {fxNote}
                  </Text>
                </View>
              ) : null}
            </View>
            <Chevron />
          </PressableScale>

          {/* Only what needs the user is flagged; a complete receipt carries
              no stamp (DESIGN.md, native app). */}
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
          {r.possibleDuplicate ? (
            <Text variant="caption" style={styles.statusText} color={colors.attentionDeep}>
              {s.detail.possibleDuplicate}
            </Text>
          ) : null}

          <View style={styles.divider} />
          <Row
            label={s.detail.date}
            value={date ? longDate(date, locale) : null}
            addLabel={s.edit.addDate}
            onPress={() => edit(routes.edit, r.id, "date")}
          />
          <Row label={s.detail.category} value={s.categories[r.category]} onPress={() => edit(routes.edit, r.id, "category")} />
          <View style={styles.staticRow}>
            <Text variant="caption" color={colors.inkMuted}>
              {s.detail.source}
            </Text>
            <Text variant="body">{s.detail.sources[r.source]}</Text>
          </View>
          {r.notes ? (
            <Text variant="caption" color={colors.inkMuted}>
              {r.notes}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        {review ? (
          firstMissing ? (
            <Button label={ADD_LABEL[firstMissing]()} onPress={() => edit(routes.edit, r.id, firstMissing)} />
          ) : (
            <Button
              label={s.edit.confirm}
              onPress={() => {
                // Confirmed at once; a refusal comes back as an alert.
                confirm(r.id);
                router.back();
              }}
            />
          )
        ) : null}
        <Button
          label={s.edit.delete}
          kind="destructive"
          onPress={() => {
            remove(r.id);
            router.back();
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  flex: { flex: 1 },
  photoFrame: {
    height: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  photo: { flex: 1 },
  photoLoading: { backgroundColor: colors.skeleton },
  // DESIGN.md "Digital receipt": paper, a hairline border, no radius.
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.hairline,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  tapLine: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.sm },
  total: { flex: 1, gap: 4, marginTop: space.xs },
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
  row: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.lg,
  },
  rowRight: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  rowValue: { flexShrink: 1, textAlign: "right" },
  missingValue: { fontFamily: fonts.semibold },
  staticRow: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.lg,
  },
  actions: { gap: space.sm },
  missingScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
});
