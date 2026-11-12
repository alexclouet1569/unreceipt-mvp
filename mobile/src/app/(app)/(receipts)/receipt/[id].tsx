// One receipt: the digital receipt (DESIGN.md "Digital receipt"), or its
// photo one tap away (a Digital / Photo switch, as on the website). What
// needs the user sits on top; then one button to add what's missing or
// confirm; then the actions: PDF, Original, Edit, Delete. Merchant, total,
// date and category on the receipt each open their own bottom sheet; Edit
// opens every field in one.

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { MobileReceipt } from "@/lib/mobile/types";
import { Button } from "../../../../components/Button";
import { DigitalReceipt, type EditableField } from "../../../../components/DigitalReceipt";
import { Segmented } from "../../../../components/insights/Segmented";
import { PressableScale } from "../../../../components/PressableScale";
import { missingFields } from "../../../../components/ReceiptRow";
import { Text } from "../../../../components/Text";
import { fill, s } from "../../../../i18n";
import { ApiError } from "../../../../lib/api";
import { useReceipt } from "../../../../lib/HomeProvider";
import { useReceiptRoutes } from "../../../../lib/routes";
import { photoCacheKey, useReceiptPhoto } from "../../../../lib/original";
import { useReceiptActions } from "../../../../lib/ReceiptActions";
import { shareReceiptOriginal, shareReceiptPdf, type FileOutcome } from "../../../../lib/receiptFiles";
import { useReceiptDetail } from "../../../../lib/useReceiptDetail";
import { durations, fonts, radius, space, makeStyles, useColors } from "../../../../theme";

type View_ = "digital" | "photo";

const ADD_LABEL: Record<"merchant" | "amount" | "date", () => string> = {
  merchant: () => s.edit.addMerchant,
  amount: () => s.edit.addAmount,
  date: () => s.edit.addDate,
};

function edit(path: string, id: string, field: EditableField | "all") {
  router.push({ pathname: path as "/receipt/edit", params: { id, field } });
}

/** The photo's frame breathes while the picture loads (as the list's placeholders). */
function PhotoPlaceholder() {
  const styles = useStyles();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: durations.long, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.fillAbs, styles.photoLoading, pulse]} />;
}

/** One action under the receipt: an SF Symbol over its name. */
function Action({
  icon,
  label,
  onPress,
  busy = false,
  muted = false,
  destructive = false,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  busy?: boolean;
  /** Looks unavailable but still answers (it explains why). */
  muted?: boolean;
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
      accessibilityState={{ busy, disabled: muted }}
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
  const hasPhoto = r?.original === "image";
  const photo = useReceiptPhoto(id, hasPhoto);
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
  const showSwitch = hasPhoto && !photo.failed;
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
            { value: "digital", label: s.detail.digital },
            { value: "photo", label: s.detail.photo },
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
        <Animated.View key="photo" entering={FadeIn.duration(durations.short)}>
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
                contentFit="contain"
                transition={durations.short}
              />
            ) : (
              <PhotoPlaceholder />
            )}
          </PressableScale>
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
          onPress={() => (pdfReady ? void run("pdf") : Alert.alert(s.detail.pdfNotReady))}
        />
        <Action
          icon="paperclip"
          label={s.detail.original}
          busy={busy === "original"}
          muted={!r.original}
          onPress={() => (r.original ? void run("original") : Alert.alert(s.detail.noOriginal))}
        />
        <Action icon="pencil" label={s.detail.editShort} onPress={() => edit(routes.edit, r.id, "all")} />
        <Action icon="trash" label={s.edit.deleteShort} destructive onPress={askDelete} />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  fillAbs: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  switch: { marginHorizontal: 0, marginTop: 0 },
  photoFrame: {
    height: 460,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.photoGround,
    overflow: "hidden",
  },
  photo: { flex: 1 },
  photoLoading: { backgroundColor: colors.skeleton },
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
