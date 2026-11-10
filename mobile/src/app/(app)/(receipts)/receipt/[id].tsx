// One receipt, as a paper receipt: its photo, the perforated top, the amount
// large in mono, then the details. Every field opens its own bottom sheet.
// A receipt waiting for the user ends with one button: add what's missing,
// or confirm it.

import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Button } from "../../../../components/Button";
import { Money } from "../../../../components/Money";
import { PerfEdge } from "../../../../components/PerfEdge";
import { PressableScale } from "../../../../components/PressableScale";
import { convertedAmount, missingFields } from "../../../../components/ReceiptRow";
import { Text } from "../../../../components/Text";
import { fill, locale, s } from "../../../../i18n";
import { longDate, parseReceiptDate } from "../../../../lib/format";
import { useHome } from "../../../../lib/HomeProvider";
import { photoCacheKey, useReceiptPhoto } from "../../../../lib/original";
import { useReceiptActions } from "../../../../lib/ReceiptActions";
import { colors, fonts, radius, space } from "../../../../theme";

type Field = "merchant" | "amount" | "date" | "category";

function edit(id: string, field: Field) {
  router.push({ pathname: "/receipt/edit", params: { id, field } });
}

/** A detail line that opens its editor; an empty required one says "Add" in red. */
function Row({ label, value, missing, onPress }: { label: string; value: string | null; missing?: boolean; onPress: () => void }) {
  return (
    <PressableScale
      scaleTo={0.99}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? s.edit.add}`}
      style={styles.row}
    >
      <Text variant="caption" color={colors.inkMuted}>
        {label}
      </Text>
      <View style={styles.rowRight}>
        <Text
          variant="body"
          style={[styles.rowValue, missing && styles.missingValue]}
          color={missing ? colors.negative : colors.ink}
          numberOfLines={2}
        >
          {value ?? s.edit.add}
        </Text>
        <SymbolView name="chevron.right" size={13} tintColor={colors.inkFaint} weight="semibold" />
      </View>
    </PressableScale>
  );
}

export default function ReceiptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { home } = useHome();
  const { confirm, remove } = useReceiptActions();
  const r = home?.state === "ready" ? home.receipts.find((x) => x.id === id) : undefined;
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
  const firstMissing: Field | null = r.missing.includes("merchant")
    ? "merchant"
    : r.missing.includes("total")
      ? "amount"
      : r.missing.includes("purchased_at")
        ? "date"
        : null;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {r.original === "image" ? (
        <PressableScale
          scaleTo={0.985}
          disabled={!photo.url}
          onPress={() => photo.url && router.push({ pathname: "/receipt/photo", params: { id: r.id, url: photo.url } })}
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
              transition={200}
            />
          ) : null}
        </PressableScale>
      ) : null}

      <View>
        <PerfEdge color={colors.card} background={colors.surface} />
        <View style={styles.card}>
          <PressableScale
            scaleTo={0.99}
            onPress={() => edit(r.id, "merchant")}
            accessibilityRole="button"
            accessibilityLabel={`${s.edit.merchant}: ${r.merchant ?? s.edit.add}`}
          >
            <Text variant="bodyLg" numberOfLines={2} color={r.merchant ? colors.ink : colors.negative}>
              {r.merchant ?? s.edit.add}
            </Text>
          </PressableScale>

          <PressableScale
            scaleTo={0.99}
            onPress={() => edit(r.id, "amount")}
            accessibilityRole="button"
            accessibilityLabel={s.edit.amount}
            style={styles.total}
          >
            {r.total != null ? (
              <Money amount={r.total} currency={r.currency} size="display" />
            ) : (
              <Text variant="bodyLg" color={colors.negative}>
                {fill(s.edit.addMissing, { field: s.fields.total })}
              </Text>
            )}
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

          <View style={styles.divider} />
          <Row
            label={s.detail.date}
            value={date ? longDate(date, locale) : null}
            missing={!date}
            onPress={() => edit(r.id, "date")}
          />
          <Row label={s.detail.category} value={s.categories[r.category]} onPress={() => edit(r.id, "category")} />
          <View style={styles.staticRow}>
            <Text variant="caption" color={colors.inkMuted}>
              {s.detail.source}
            </Text>
            <Text variant="body">{s.detail.sources[r.source]}</Text>
          </View>
          {r.possibleDuplicate ? (
            <Text variant="caption" style={styles.statusText} color={colors.attentionDeep}>
              {s.detail.possibleDuplicate}
            </Text>
          ) : null}
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
            <Button
              label={fill(s.edit.addMissing, {
                field: s.fields[firstMissing === "amount" ? "total" : firstMissing === "date" ? "purchased_at" : "merchant"],
              })}
              onPress={() => edit(r.id, firstMissing)}
            />
          ) : (
            <Button
              label={s.edit.confirm}
              onPress={async () => {
                if (await confirm(r.id)) router.back();
              }}
            />
          )
        ) : null}
        <Button
          label={s.edit.delete}
          kind="destructive"
          onPress={() => {
            router.back();
            remove(r.id);
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  photoFrame: {
    height: 220,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.skeleton,
    overflow: "hidden",
  },
  photo: { flex: 1 },
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
