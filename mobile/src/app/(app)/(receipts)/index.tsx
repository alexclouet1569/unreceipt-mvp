// The home screen: scans on their way, then what needs the user, then every
// receipt by day. Opens on the saved list at once, refreshes in the
// background, pull down to refresh by hand. The big button scans.

import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn } from "react-native-reanimated";
import { BrandMark } from "../../../components/Brand";
import { Button } from "../../../components/Button";
import { CategoryChips } from "../../../components/CategoryChips";
import { InviteCard } from "../../../components/InviteCard";
import { SummaryCard } from "../../../components/SummaryCard";
import { ForwardingCard } from "../../../components/ForwardingCard";
import { PendingRow } from "../../../components/PendingRow";
import { PressableScale } from "../../../components/PressableScale";
import { ReceiptRow } from "../../../components/ReceiptRow";
import { SCAN_BUTTON_SPACE, ScanButton } from "../../../components/ScanButton";
import { SwipeToDelete, closeOpenSwipe } from "../../../components/SwipeToDelete";
import { ReceiptSkeleton } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { locale, s } from "../../../i18n";
import { useHome } from "../../../lib/HomeProvider";
import { UndoToast, useReceiptActions } from "../../../lib/ReceiptActions";
import { useScans } from "../../../lib/scans/ScanProvider";
import { buildSections } from "../../../lib/sections";
import { categoryCounts, filterByCategory, type PeriodKey } from "../../../lib/summary";
import type { ReceiptCategory } from "@/lib/types";
import { colors, durations, radius, space } from "../../../theme";

function Notice({ text }: { text: string }) {
  return (
    <Animated.View entering={FadeIn.duration(durations.short)} style={styles.notice}>
      <Text variant="caption" color={colors.attentionDeep}>
        {text}
      </Text>
    </Animated.View>
  );
}

function Empty({ address }: { address: string }) {
  return (
    <Animated.View entering={FadeIn.duration(durations.medium)} style={styles.empty}>
      <View style={styles.emptyMark}>
        <BrandMark size={40} variant="bare" />
      </View>
      <Text variant="displayLg" style={styles.center}>
        {s.receipts.emptyTitle}
      </Text>
      <Text variant="body" color={colors.inkMuted} style={styles.center}>
        {s.receipts.emptyBody}
      </Text>
      <View style={styles.emptyCard}>
        <ForwardingCard address={address} />
      </View>
    </Animated.View>
  );
}

function PhotosButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale
      scaleTo={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={s.scan.fromPhotos}
      hitSlop={10}
      style={styles.headerButton}
    >
      <SymbolView name="photo.on.rectangle.angled" size={22} tintColor={colors.ink} />
    </PressableScale>
  );
}

/** Shown on every state of the screen: scans keep working offline. */
function PendingList() {
  const { pending, remove, retry } = useScans();
  if (pending.length === 0) return null;
  return (
    <View style={styles.pending}>
      {pending.map((p) => (
        <PendingRow key={p.id} scan={p} onRemove={() => remove(p.id)} onRetry={() => retry(p.id)} />
      ))}
    </View>
  );
}

// A receipt that has just arrived (a scan read, a forward) fades in.
const FRESH_MS = 30_000;

export default function Receipts() {
  const { home, error, refreshing, loading, refresh } = useHome();
  const { pending, scan, pickPhotos } = useScans();
  const actions = useReceiptActions();
  const receipts = home?.state === "ready" ? home.receipts : null;
  // null: this month, so the default follows the calendar.
  const [period, setPeriod] = useState<PeriodKey | null>(null);
  const [chosenCategory, setCategory] = useState<ReceiptCategory | null>(null);
  const counts = useMemo(() => (receipts ? categoryCounts(receipts) : []), [receipts]);
  const filtered = useMemo(
    () => filterByCategory(receipts ?? [], chosenCategory),
    [receipts, chosenCategory],
  );
  const sections = useMemo(
    () => (receipts ? buildSections(filtered.receipts, s, locale) : []),
    [receipts, filtered],
  );

  let body: React.ReactNode;
  if (!home && loading) {
    body = (
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            <PendingList />
            <ReceiptSkeleton />
          </View>
        }
      />
    );
  } else if (!home || home.state !== "ready") {
    body = (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <PendingList />
        <View style={styles.failed}>
          <Text variant="body" color={colors.inkMuted} style={styles.center}>
            {error === "offline" ? s.common.unreachable : s.receipts.loadFailed}
          </Text>
          <Button label={s.common.retry} onPress={() => void refresh()} busy={refreshing} />
        </View>
      </ScrollView>
    );
  } else {
    body = (
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        onScrollBeginDrag={closeOpenSwipe}
        refreshControl={
          <RefreshControl refreshing={refreshing && !loading} onRefresh={() => void refresh()} tintColor={colors.inkMuted} />
        }
        ListHeaderComponent={
          <View>
            {error ? <Notice text={error === "offline" ? s.common.offline : s.receipts.loadFailed} /> : null}
            {home.accountantInvites.map((invite) => (
              <InviteCard key={invite.id} invite={invite} />
            ))}
            {home.receipts.length > 0 ? (
              <>
                <SummaryCard
                  receipts={filtered.receipts}
                  allReceipts={home.receipts}
                  homeCurrency={home.homeCurrency}
                  period={period ?? ""}
                  onPeriod={setPeriod}
                />
                <CategoryChips
                  counts={counts}
                  total={home.receipts.length}
                  selected={filtered.category}
                  onSelect={(c) => {
                    closeOpenSwipe();
                    setCategory(c);
                  }}
                />
              </>
            ) : null}
            <PendingList />
          </View>
        }
        ListEmptyComponent={pending.length === 0 ? <Empty address={home.forwardingEmail} /> : undefined}
        renderSectionHeader={({ section }) => (
          <Text
            variant="micro"
            color={section.attention ? colors.attentionDeep : colors.inkMuted}
            style={styles.sectionLabel}
            accessibilityRole="header"
          >
            {section.title}
            {section.attention ? (
              <Text variant="micro" style={styles.count} color={colors.attentionDeep}>{`  ${section.data.length}`}</Text>
            ) : null}
          </Text>
        )}
        renderItem={({ item }) => {
          const row = (
            <SwipeToDelete onDelete={() => actions.remove(item.id)}>
              <ReceiptRow
                receipt={item}
                onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: item.id } })}
                onDelete={() => actions.remove(item.id)}
              />
            </SwipeToDelete>
          );
          const fresh = Date.now() - Date.parse(item.createdAt) < FRESH_MS;
          return fresh ? <Animated.View entering={FadeIn.duration(durations.medium)}>{row}</Animated.View> : row;
        }}
        contentContainerStyle={styles.content}
      />
    );
  }

  // The list comes first in the screen, so the large title can follow its
  // scrolling; the scan button and the Undo bar float over it.
  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ headerRight: () => <PhotosButton onPress={() => void pickPhotos()} /> }} />
      {body}
      <ScanButton onScan={() => void scan()} onPickPhotos={() => void pickPhotos()} />
      <UndoToast />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Room under the last card for the scan button.
  content: { paddingBottom: SCAN_BUTTON_SPACE + space.lg },
  center: { textAlign: "center" },
  count: { fontVariant: ["tabular-nums"] },
  pending: { marginTop: space.lg },
  sectionLabel: {
    marginHorizontal: space.lg,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  notice: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.attentionTint,
  },
  headerButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  empty: { paddingHorizontal: space.xl, paddingTop: space.xxl, alignItems: "center", gap: space.md },
  emptyMark: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  emptyCard: { alignSelf: "stretch", marginTop: space.md },
  failed: { justifyContent: "center", padding: space.xl, paddingTop: space.xxxl, gap: space.lg },
});
