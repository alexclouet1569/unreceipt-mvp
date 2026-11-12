// The home screen: scans on their way, then what needs the user, then every
// receipt by day. Opens on the saved list at once, refreshes in the
// background, pull down to refresh by hand. The big button scans.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MobileReceipt } from "@/lib/mobile/types";
import { AccessibilityInfo, RefreshControl, ScrollView, SectionList, StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn } from "react-native-reanimated";
import { BrandMark } from "../../../components/Brand";
import { Button } from "../../../components/Button";
import { CategoryChips } from "../../../components/CategoryChips";
import { InviteCard } from "../../../components/InviteCard";
import { Onboarding, type OnboardingStep } from "../../../components/Onboarding";
import { markOnboarded } from "../../../lib/api";
import { readOnboarded, writeOnboarded } from "../../../lib/cache";
import { useAuth } from "../../../auth/AuthProvider";
import { PilotBox } from "../../../components/PilotBox";
import { StatCards } from "../../../components/StatCards";
import { ViewToggle, type ListView } from "../../../components/ViewToggle";
import { ForwardingCard } from "../../../components/ForwardingCard";
import { PendingRow } from "../../../components/PendingRow";
import { PressableScale } from "../../../components/PressableScale";
import { ReceiptRow } from "../../../components/ReceiptRow";
import { SCAN_BUTTON_SPACE, ScanButton } from "../../../components/ScanButton";
import { SwipeToDelete, closeOpenSwipe } from "../../../components/SwipeToDelete";
import { ReceiptSkeleton } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { fill, locale, s } from "../../../i18n";
import { useHome } from "../../../lib/HomeProvider";
import { UndoToast, useReceiptActions } from "../../../lib/ReceiptActions";
import { useScans } from "../../../lib/scans/ScanProvider";
import { buildSections } from "../../../lib/sections";
import { applyFilter, categoryCounts, categorySections, type ListFilter, type PeriodKey, type TotalLine } from "../../../lib/summary";
import { formatMoney } from "../../../lib/format";
import { durations, radius, space, makeStyles, useColors } from "../../../theme";

function Notice({ text }: { text: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Animated.View entering={FadeIn.duration(durations.short)} style={styles.notice}>
      <Text variant="caption" color={colors.attentionDeep}>
        {text}
      </Text>
    </Animated.View>
  );
}

function Empty({ address }: { address: string }) {
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
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

type ListSection = {
  key: string;
  title: string;
  attention: boolean;
  data: MobileReceipt[];
  /** By category: the section's total. */
  totals?: TotalLine[];
};

/** "1 305,00 kr + €18.50", with "≈" before an ECB estimate. */
function totalText(lines: TotalLine[]): string {
  return lines
    .map((l) => {
      const money = formatMoney(l.amount, l.currency, locale);
      return l.estimate ? fill(s.receipts.estimate, { amount: money }) : money;
    })
    .join(s.receipts.totalJoin);
}

/**
 * One card with its swipe. Memoised with stable callbacks, so a change to
 * one receipt (or the refresh flag) re-renders that card only. A receipt
 * that arrived while the screen was open (a scan read, a forward) fades in.
 */
const Row = memo(function Row({
  receipt,
  fresh,
  onOpen,
  onDelete,
}: {
  receipt: MobileReceipt;
  fresh: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const row = (
    <SwipeToDelete onDelete={() => onDelete(receipt.id)}>
      <ReceiptRow receipt={receipt} onPress={() => onOpen(receipt.id)} onDelete={() => onDelete(receipt.id)} />
    </SwipeToDelete>
  );
  return fresh ? <Animated.View entering={FadeIn.duration(durations.medium)}>{row}</Animated.View> : row;
});

/**
 * Ids that appeared after the list was first shown. The first list (from
 * the saved copy or the server) never animates; later arrivals do, once.
 */
function useFreshIds(receipts: MobileReceipt[] | null): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const fresh = useRef<Set<string>>(new Set());
  return useMemo(() => {
    if (!receipts) return fresh.current;
    if (!seen.current) {
      seen.current = new Set(receipts.map((r) => r.id));
      return fresh.current;
    }
    const next = new Set(fresh.current);
    for (const r of receipts) {
      if (!seen.current.has(r.id)) {
        seen.current.add(r.id);
        next.add(r.id);
      }
    }
    fresh.current = next;
    return next;
  }, [receipts]);
}

export default function Receipts() {
  const styles = useStyles();
  const colors = useColors();
  const { home, error, refreshing, loading, refresh, mutateHome, extra, older, loadOlder, fromServer } = useHome();
  const { userId } = useAuth();
  const { pending, scan, pickPhotos } = useScans();
  const actions = useReceiptActions();
  // The list: the server's newest 50, then any older pages loaded with
  // "Load more" (kept in `extra`; the totals never count them twice).
  const receipts = useMemo(() => {
    if (home?.state !== "ready") return null;
    if (older.ids.length === 0) return home.receipts;
    const listed = new Set(home.receipts.map((r) => r.id));
    const byId = new Map(extra.map((r) => [r.id, r]));
    const more = older.ids.filter((id) => !listed.has(id)).flatMap((id) => byId.get(id) ?? []);
    return [...home.receipts, ...more];
  }, [home, older.ids, extra]);

  // First run (the website's three steps): starts only on the server's own
  // answer (never the saved copy, which may be old) when this phone hasn't
  // finished it, and then stays until finished, even once the first
  // receipt has arrived. A fresh "no" before the user moved on stops it.
  const [onboarding, setOnboarding] = useState<OnboardingStep | null>(null);
  const [doneHere, setDoneHere] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void readOnboarded(userId).then((done) => alive && setDoneHere(done));
    return () => {
      alive = false;
    };
  }, [userId]);
  const serverSays = fromServer && home?.state === "ready" ? home.showOnboarding : null;
  useEffect(() => {
    if (serverSays === true && doneHere === false && onboarding == null) setOnboarding(1);
    if (serverSays === false && onboarding === 1) setOnboarding(null);
  }, [serverSays, doneHere, onboarding]);
  // Step 2: a scan or a receipt that wasn't there when it began moves on.
  const arrivedIds = useMemo(
    () => [...pending.map((p) => p.id), ...(home?.state === "ready" ? home.receipts.map((r) => r.id) : [])],
    [pending, home],
  );
  const idsAtScanStep = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (onboarding === 2 && arrivedIds.some((id) => !idsAtScanStep.current.has(id))) setOnboarding(3);
  }, [onboarding, arrivedIds]);
  const finishOnboarding = useCallback(() => {
    setDoneHere(true);
    setOnboarding(null);
    if (userId) void writeOnboarded(userId);
    mutateHome((h) => ({ ...h, showOnboarding: false }));
    markOnboarded();
  }, [mutateHome, userId]);
  // null: this month, so the default follows the calendar.
  const [period, setPeriod] = useState<PeriodKey | null>(null);
  const [chosenFilter, setFilter] = useState<ListFilter>("all");
  const [view, setView] = useState<ListView>("date");
  const counts = useMemo(() => (receipts ? categoryCounts(receipts) : []), [receipts]);
  const toConfirm = useMemo(() => (receipts ?? []).filter((r) => r.status === "pending_review").length, [receipts]);
  // Only the newest list: a page of older receipts isn't "new arrivals".
  const freshIds = useFreshIds(home?.state === "ready" ? home.receipts : null);
  // VoiceOver hears what "Show older receipts" did (iOS has no live regions).
  const olderBefore = useRef<number | null>(null);
  useEffect(() => {
    if (older.loading) {
      olderBefore.current = older.ids.length;
      return;
    }
    if (olderBefore.current == null) return;
    const added = older.ids.length - olderBefore.current;
    olderBefore.current = null;
    AccessibilityInfo.announceForAccessibility(
      older.failed ? s.receipts.loadOlderFailed : fill(s.receipts.olderShown, { count: added }),
    );
  }, [older.loading, older.failed, older.ids.length]);
  const { remove } = actions;
  const openReceipt = useCallback((id: string) => router.push({ pathname: "/receipt/[id]", params: { id } }), []);
  const deleteReceipt = useCallback((id: string) => remove(id), [remove]);
  const filtered = useMemo(() => applyFilter(receipts ?? [], chosenFilter), [receipts, chosenFilter]);
  const homeCurrency = home?.state === "ready" ? home.homeCurrency : "SEK";
  const sections = useMemo((): ListSection[] => {
    if (!receipts || onboarding != null) return [];
    if (view === "category") {
      return categorySections(filtered.receipts, homeCurrency).map((c) => ({
        key: c.key,
        title: s.categories[c.category],
        attention: false,
        data: c.data,
        totals: c.totals,
      }));
    }
    return buildSections(filtered.receipts, s, locale);
  }, [receipts, filtered, view, homeCurrency, onboarding]);

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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.inkMuted} />}
      >
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
            {/* The website's order: pilot banner, the page title, then invites. */}
            {home.access === "pilot" ? <PilotBox /> : null}
            <View style={styles.heading}>
              <Text variant="displayLg" accessibilityRole="header">
                {s.summary.yourReceipts}
              </Text>
              <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
                {home.email}
              </Text>
            </View>
            {home.accountantInvites.map((invite) => (
              <InviteCard key={invite.id} invite={invite} />
            ))}
            {onboarding != null ? (
              <Onboarding
                step={onboarding}
                address={home.forwardingEmail}
                onNext={() => {
                  if (onboarding === 1) idsAtScanStep.current = new Set(arrivedIds);
                  setOnboarding(onboarding === 1 ? 2 : 3);
                }}
                onScan={() => void scan()}
                onFinish={finishOnboarding}
              />
            ) : home.receipts.length > 0 ? (
              <>
                <StatCards
                  receipts={home.receipts}
                  older={home.older}
                  homeCurrency={home.homeCurrency}
                  period={period ?? ""}
                  onPeriod={setPeriod}
                />
                <ViewToggle
                  view={view}
                  onChange={(v) => {
                    closeOpenSwipe();
                    setView(v);
                  }}
                />
                <CategoryChips
                  counts={counts}
                  total={receipts?.length ?? home.receipts.length}
                  toConfirm={toConfirm}
                  selected={filtered.filter}
                  onSelect={(f) => {
                    closeOpenSwipe();
                    setFilter(f);
                  }}
                />
              </>
            ) : null}
            <PendingList />
          </View>
        }
        ListEmptyComponent={pending.length === 0 && onboarding == null ? <Empty address={home.forwardingEmail} /> : undefined}
        ListFooterComponent={
          onboarding == null && older.hasMore && home.receipts.length > 0 ? (
            <View style={styles.more}>
              {older.failed ? (
                <Text variant="caption" color={colors.attentionDeep} style={styles.center}>
                  {s.receipts.loadOlderFailed}
                </Text>
              ) : null}
              <Button kind="outline" label={s.receipts.loadOlder} busy={older.loading} onPress={() => void loadOlder()} />
            </View>
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          // "Travel · 3" on the left; by category, the total in mono on the right (as the website).
          <View style={styles.sectionRow}>
            <Text
              variant="micro"
              color={section.attention ? colors.attentionDeep : colors.inkMuted}
              style={styles.sectionTitle}
              accessibilityRole="header"
            >
              {section.title}
              {section.attention || section.totals ? (
                <Text
                  variant="micro"
                  style={styles.count}
                  color={section.attention ? colors.attentionDeep : colors.inkMuted}
                >{` · ${section.data.length}`}</Text>
              ) : null}
            </Text>
            {section.totals && section.totals.length > 0 ? (
              <Text variant="amountRow" style={styles.sectionTotal} color={colors.inkMuted} numberOfLines={1}>
                {totalText(section.totals)}
              </Text>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <Row receipt={item} fresh={freshIds.has(item.id)} onOpen={openReceipt} onDelete={deleteReceipt} />
        )}
        contentContainerStyle={styles.content}
      />
    );
  }

  // The list fills the screen; the scan button and the Undo bar float over it.
  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ headerRight: () => <PhotosButton onPress={() => void pickPhotos()} /> }} />
      {body}
      {/* Hidden during the first run: each of its steps has its own action. */}
      {onboarding == null ? <ScanButton onScan={() => void scan()} onPickPhotos={() => void pickPhotos()} /> : null}
      <UndoToast />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  more: { marginHorizontal: space.lg, marginTop: space.md, gap: space.sm },
  fill: { flex: 1 },
  // Room under the last card for the scan button.
  content: { paddingBottom: SCAN_BUTTON_SPACE + space.lg },
  center: { textAlign: "center" },
  count: { fontVariant: ["tabular-nums"] },
  pending: { marginTop: space.lg },
  heading: { marginHorizontal: space.lg, marginTop: space.lg, gap: 2 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sectionTitle: { flexShrink: 1 },
  sectionTotal: { marginLeft: "auto", fontSize: 12, lineHeight: 16 },
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
}));
