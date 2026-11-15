// One receipt: the digital receipt (DESIGN.md "Digital receipt"), or its
// original one tap away (a Digital receipt / Original switch, as on the
// website, for every receipt with an original: photo, PDF, email or text
// message; components/OriginalView.tsx). What
// needs the user sits on top; then one button to add what's missing or
// confirm; then the actions: PDF, Original, Edit, Delete. Merchant, total,
// date and category on the receipt each open their own bottom sheet; Edit
// opens every field in one.

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import type { MobileReceipt } from "@/lib/mobile/types";
import { Button } from "../../../../components/Button";
import { DigitalReceipt, type EditableField } from "../../../../components/DigitalReceipt";
import { Segmented } from "../../../../components/insights/Segmented";
import { OriginalView } from "../../../../components/OriginalView";
import { PressableScale } from "../../../../components/PressableScale";
import { missingFields } from "../../../../components/ReceiptRow";
import { Text } from "../../../../components/Text";
import { fill, s } from "../../../../i18n";
import { ApiError } from "../../../../lib/api";
import { useHome, useReceipt } from "../../../../lib/HomeProvider";
import { useReceiptRoutes } from "../../../../lib/routes";
import { useReceiptActions } from "../../../../lib/ReceiptActions";
import { shareReceiptOriginal, shareReceiptPdf, type FileOutcome } from "../../../../lib/receiptFiles";
import { useReceiptDetail } from "../../../../lib/useReceiptDetail";
import { durations, fonts, radius, space, makeStyles, useColors } from "../../../../theme";

type View_ = "digital" | "original";

const ADD_LABEL: Record<"merchant" | "amount" | "date", () => string> = {
  merchant: () => s.edit.addMerchant,
  amount: () => s.edit.addAmount,
  date: () => s.edit.addDate,
};

function edit(path: string, id: string, field: EditableField | "all") {
  router.push({ pathname: path as "/receipt/edit", params: { id, field } });
}

/** One action under the receipt: an SF Symbol over its name. */
function Action({
  icon,
  label,
  onPress,
  busy = false,
  muted = false,
  hint,
  destructive = false,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  busy?: boolean;
  /** Looks unavailable but still answers (it explains why). */
  muted?: boolean;
  /** Why it is unavailable, told to VoiceOver before the tap. */
  hint?: string;
  destructive?: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  const tint = destructive ? colors.negative : muted ? colors.inkFaint : colors.ink;
  return (
    <PressableScale
      scaleTo={0.94}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={muted ? hint : undefined}
      accessibilityState={{ busy }}
      style={styles.action}
    >
      <View style={styles.actionIcon}>
        {busy ? <ActivityIndicator color={colors.inkMuted} /> : <SymbolView name={icon} size={20} weight="medium" tintColor={tint} />}
      </View>
      <Text variant="caption" style={styles.actionLabel} color={destructive ? colors.negative : muted ? colors.inkMuted : colors.ink} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export default function ReceiptDetail() {
  const styles = useStyles();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { confirm, remove } = useReceiptActions();
  const routes = useReceiptRoutes();
  const live = useReceipt(id);
  // After Delete the row is gone while the screen slides away: keep showing
  // the last version instead of an error.
  const last = useRef<MobileReceipt | undefined>(live);
  if (live) last.current = live;
  const r = live ?? last.current;
  const detail = useReceiptDetail(id, live);
  // Opened from anywhere (the list, Insights, the notice): no longer new.
  const { newReceipts } = useHome();
  const isNew = newReceipts.items.some((n) => n.id === id);
  useEffect(() => {
    if (isNew) newReceipts.open(id);
  }, [isNew, id, newReceipts]);
  const [view, setView] = useState<View_>("digital");
  const [busy, setBusy] = useState<"pdf" | "original" | null>(null);

  if (!r) {
    return (
      <View style={styles.missingScreen}>
        <Text variant="body" color={colors.inkMuted}>
          {s.receipts.loadFailed}
        </Text>
      </View>
    );
  }

  const missing = missingFields(r);
  const review = r.status === "pending_review";
  const firstMissing: "merchant" | "amount" | "date" | null = r.missing.includes("merchant")
    ? "merchant"
    : r.missing.includes("total")
      ? "amount"
      : r.missing.includes("purchased_at")
        ? "date"
        : null;
  // The server refuses the PDF while the receipt waits for review (409).
  const pdfReady = detail ? detail.pdfReady : !review;
  const showSwitch = r.original != null;
  const shown: View_ = showSwitch ? view : "digital";

  const run = async (which: "pdf" | "original") => {
    if (busy) return;
    setBusy(which);
    let outcome: FileOutcome | "offline";
    try {
      outcome = which === "pdf" ? await shareReceiptPdf(r.id, r.merchant) : await shareReceiptOriginal(r.id);
    } catch (err) {
      outcome = err instanceof ApiError && err.kind === "offline" ? "offline" : "failed";
    } finally {
      setBusy(null);
    }
    if (outcome === "shared") return;
    if (outcome === "none") return Alert.alert(s.detail.noOriginal);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(outcome === "offline" ? s.common.unreachable : s.detail.downloadFailed);
  };

  const askDelete = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(s.detail.deleteTitle, s.detail.deleteBody, [
      { text: s.common.cancel, style: "cancel" },
      {
        text: s.edit.deleteShort,
        style: "destructive",
        onPress: () => {
          remove(r.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {/* Only what needs the user is flagged; a complete receipt carries
          no band (DESIGN.md, native app). */}
      {missing ? (
        <View style={[styles.band, styles.bandMissing]}>
          <Text variant="caption" style={styles.statusText} color={colors.negative}>
            {fill(s.detail.statusMissing, { fields: missing })}
          </Text>
        </View>
      ) : review ? (
        <View style={styles.band}>
          <Text variant="caption" style={styles.statusText} color={colors.attentionDeep}>
            {s.detail.statusToConfirm}
          </Text>
        </View>
      ) : null}
      {r.possibleDuplicate ? (
        <View style={styles.band}>
          <Text variant="caption" style={styles.statusText} color={colors.attentionDeep}>
            {s.detail.possibleDuplicate}
          </Text>
        </View>
      ) : null}

      {showSwitch ? (
        <Segmented
          label={s.detail.viewLabel}
          options={[
            { value: "digital", label: s.detail.digitalReceipt },
            { value: "original", label: s.detail.original },
          ]}
          value={view}
          onChange={setView}
          style={styles.switch}
        />
      ) : null}

      {shown === "digital" ? (
        <Animated.View key="digital" entering={FadeIn.duration(durations.short)}>
          <DigitalReceipt receipt={r} detail={detail} onEdit={(field) => edit(routes.edit, r.id, field)} />
        </Animated.View>
      ) : (
        <Animated.View key="original" entering={FadeIn.duration(durations.short)}>
          <OriginalView receipt={r} photoRoute={routes.photo} />
        </Animated.View>
      )}

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

      <View style={styles.actions} accessibilityLabel={s.detail.actions}>
        <Action
          icon="arrow.down.doc"
          label={s.detail.pdf}
          busy={busy === "pdf"}
          muted={!pdfReady}
          hint={s.detail.pdfNotReady}
          onPress={() => (pdfReady ? void run("pdf") : Alert.alert(s.detail.pdfNotReady))}
        />
        <Action
          icon="paperclip"
          label={s.detail.original}
          busy={busy === "original"}
          muted={!r.original}
          hint={s.detail.noOriginal}
          onPress={() => (r.original ? void run("original") : Alert.alert(s.detail.noOriginal))}
        />
        <Action icon="pencil" label={s.detail.editShort} onPress={() => edit(routes.edit, r.id, "all")} />
        {/* A client's receipt opened by its accountant: only the owner deletes. */}
        {routes.firm ? null : <Action icon="trash" label={s.edit.deleteShort} destructive onPress={askDelete} />}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  switch: { marginHorizontal: 0, marginTop: 0 },
  band: {
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.attentionTint,
  },
  bandMissing: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline },
  statusText: { fontFamily: fonts.semibold },
  actions: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
  },
  action: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 4 },
  actionIcon: { height: 24, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: fonts.semibold },
  missingScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
}));
