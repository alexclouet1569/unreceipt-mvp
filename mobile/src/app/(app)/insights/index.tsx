// Insights: where the money goes. A period (month, quarter, year or any
// dates), its total against the period before and last year, the chart,
// what's worth knowing, categories, merchants and the VAT on the receipts.
// Every number opens the receipts behind it. Opens on the saved answer,
// refreshes behind it; a new period keeps the old numbers dimmed until
// its own arrive, so the screen never blanks.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import Animated, { FadeIn } from "react-native-reanimated";
import type { AnalyticsInsight } from "@/lib/mobile/types";
import { Button } from "../../../components/Button";
import { BarChart } from "../../../components/insights/Charts";
import { Hero } from "../../../components/insights/Hero";
import { PeriodHeader } from "../../../components/insights/PeriodHeader";
import { Segmented } from "../../../components/insights/Segmented";
import { Categories, Findings, Merchants, Quality, VatPanel } from "../../../components/insights/Sections";
import { useBreathing } from "../../../components/Skeleton";
import { Text } from "../../../components/Text";
import { locale, s } from "../../../i18n";
import { formatMoney } from "../../../lib/format";
import {
  addDays,
  daysBetween,
  insightFilter,
  insightText,
  periodQueryString,
  periodTitle,
  shiftPeriod,
  type PeriodQuery,
  type ReadyAnalytics,
} from "../../../lib/insights";
import { useInsights } from "../../../lib/useInsights";
import { colors, durations, radius, space } from "../../../theme";

type Kind = PeriodQuery["kind"];

const INTL_LOCALE = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" } as const;
const MAX_DAYS = 730;
const toDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** The query that shows exactly the period of an answer. */
function queryOf(a: ReadyAnalytics): PeriodQuery {
  return a.period.kind === "custom"
    ? { kind: "custom", from: a.period.from, to: a.period.to }
    : { kind: a.period.kind, anchor: a.period.key };
}

/** Shapes of the screen while the very first answer loads. */
function InsightsSkeleton() {
  const pulse = useBreathing();
  return (
    <Animated.View style={[styles.skeleton, pulse]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bone, { width: 60, height: 10 }]} />
      <View style={[styles.bone, { width: 200, height: 40 }]} />
      <View style={[styles.bone, { width: 140, height: 14 }]} />
      <View style={styles.bars}>
        {[30, 55, 20, 70, 45, 90, 35, 60, 25, 80].map((h, i) => (
          <View key={i} style={[styles.bone, styles.bar, { height: h }]} />
        ))}
      </View>
      <View style={[styles.bone, { height: 120, borderRadius: radius.lg }]} />
    </Animated.View>
  );
}

/** Two calendars in a page sheet: from and to. */
function CustomRange({
  visible,
  initial,
  today,
  onClose,
  onPick,
}: {
  visible: boolean;
  initial: { from: string; to: string };
  today: string;
  onClose: () => void;
  onPick: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  useEffect(() => {
    if (visible) {
      setFrom(initial.from);
      setTo(initial.to);
    }
  }, [visible, initial.from, initial.to]);
  const tooLong = daysBetween(from, to) > MAX_DAYS;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* iOS's sheet header: Cancel leading, the title centred, Show where the thumb confirms. */}
      <View style={styles.sheetHeader}>
        <View style={styles.sheetSide}>
          <Button label={s.common.cancel} kind="plain" onPress={onClose} />
        </View>
        <Text variant="merchant" accessibilityRole="header" style={styles.sheetTitle} numberOfLines={1}>
          {s.insights.customTitle}
        </Text>
        <View style={[styles.sheetSide, styles.sheetRight]}>
          <Button label={s.insights.show} kind="plain" disabled={tooLong} onPress={() => onPick(from, to)} />
        </View>
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text variant="micro" color={colors.inkMuted}>
          {s.insights.from}
        </Text>
        <DateTimePicker
          value={fromDay(from)}
          mode="date"
          display="inline"
          maximumDate={fromDay(today)}
          locale={INTL_LOCALE[locale]}
          accentColor={colors.brandAction}
          themeVariant="light"
          onValueChange={(_e, d) => {
            const day = toDay(d);
            setFrom(day);
            if (day > to) setTo(day);
          }}
        />
        <Text variant="micro" color={colors.inkMuted}>
          {s.insights.to}
        </Text>
        <DateTimePicker
          value={fromDay(to)}
          mode="date"
          display="inline"
          minimumDate={fromDay(from)}
          maximumDate={fromDay(today)}
          locale={INTL_LOCALE[locale]}
          accentColor={colors.brandAction}
          themeVariant="light"
          onValueChange={(_e, d) => setTo(toDay(d))}
        />
        {tooLong ? (
          <Text variant="caption" color={colors.attentionDeep} accessibilityLiveRegion="polite">
            {s.insights.tooLong}
          </Text>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

export default function Insights() {
  const [query, setQuery] = useState<PeriodQuery>({ kind: "month" });
  const [picking, setPicking] = useState(false);
  const { data, error, refreshing, loading, refresh } = useInsights(query);

  // The last answer stays on screen (dimmed) while a new period loads.
  const lastReady = useRef<ReadyAnalytics | null>(null);
  if (data?.state === "ready") lastReady.current = data;
  const a = data?.state === "ready" ? data : lastReady.current;
  const stale = data?.state !== "ready" && a != null;

  const kinds: { value: Kind; label: string }[] = [
    { value: "month", label: s.insights.month },
    { value: "quarter", label: s.insights.quarter },
    { value: "year", label: s.insights.year },
    { value: "custom", label: s.insights.custom },
  ];

  const today = a?.today ?? toDay(new Date());
  const customInitial =
    query.kind === "custom" ? { from: query.from, to: query.to } : { from: addDays(today, -29), to: today };

  const drill = (params: Record<string, string>, title: string) => {
    if (!a) return;
    const qs = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(periodQueryString(queryOf(a)))), ...params });
    router.push({ pathname: "/insights/list", params: { q: qs.toString(), title } });
  };
  const openFinding = (i: AnalyticsInsight) => {
    const filter = insightFilter(i);
    if (filter && a) drill(filter, insightText(i, a.currency, locale, s).title);
  };

  // While a new period loads, the arrows wait: they'd step from the old one.
  const previous = a && !stale ? shiftPeriod(a, -1) : null;
  const next = a && !stale ? shiftPeriod(a, 1) : null;

  // VoiceOver hears a new period's total, and a failure.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (data?.state !== "ready") return;
    const id = `${data.period.kind}:${data.period.key}`;
    if (announced.current === id) return;
    const first = announced.current == null;
    announced.current = id;
    if (!first) {
      AccessibilityInfo.announceForAccessibility(
        `${periodTitle(data.period, locale, s)}: ${formatMoney(data.total.amount, data.currency, locale)}`,
      );
    }
  }, [data]);
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error === "offline" ? s.common.unreachable : s.insights.loadFailed);
  }, [error]);

  let body: React.ReactNode;
  if (!a && loading) {
    body = <InsightsSkeleton />;
  } else if (!a) {
    body = (
      <View style={styles.failed}>
        <Text variant="body" color={colors.inkMuted} style={styles.center}>
          {error === "offline" ? s.common.unreachable : s.insights.loadFailed}
        </Text>
        <Button label={s.common.retry} onPress={() => void refresh()} busy={refreshing} />
      </View>
    );
  } else {
    const empty = a.total.count === 0;
    body = (
      <Animated.View entering={FadeIn.duration(durations.medium)} style={stale && styles.stale}>
        <Hero a={a} onOpen={() => drill({}, periodTitle(a.period, locale, s))} />
        {empty ? (
          <View style={styles.empty}>
            <Text variant="bodyLg">{s.insights.emptyTitle}</Text>
            <Text variant="body" color={colors.inkMuted}>
              {s.insights.emptyBody}
            </Text>
          </View>
        ) : (
          <>
            <BarChart a={a} />
            {a.total.count < 3 ? (
              <View style={styles.few}>
                <Text variant="merchant">{s.insights.fewTitle}</Text>
                <Text variant="caption" color={colors.inkMuted}>
                  {s.insights.fewBody}
                </Text>
              </View>
            ) : null}
            <Findings a={a} onOpen={openFinding} />
            <Categories a={a} onOpen={(c) => drill({ category: c.category }, s.categories[c.category])} />
            <Merchants a={a} onOpen={(m) => drill({ merchant: m.key }, m.name)} />
            <VatPanel a={a} onToCheck={() => drill({ quality: "vat_to_check" }, s.insights.vatToCheck)} />
          </>
        )}
        <Quality a={a} onOpen={(which) => drill({ quality: which }, s.insights.qualityTitle)} />
      </Animated.View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing && !!a && !stale} onRefresh={() => void refresh()} tintColor={colors.inkMuted} />}
    >
      {error && a ? (
        <View style={styles.notice}>
          <Text variant="caption" color={colors.attentionDeep}>
            {error === "offline" ? s.common.offline : s.insights.loadFailed}
          </Text>
        </View>
      ) : null}
      <Segmented
        label={s.insights.periodGroup}
        options={kinds}
        value={query.kind}
        onChange={(kind) => {
          if (kind === "custom") {
            setPicking(true);
            return;
          }
          if (kind !== query.kind) setQuery({ kind });
        }}
      />
      <PeriodHeader
        title={a ? periodTitle(a.period, locale, s) : " "}
        onPrevious={previous ? () => setQuery(previous) : null}
        onNext={next ? () => setQuery(next) : null}
      />
      {body}
      <CustomRange
        visible={picking}
        initial={customInitial}
        today={today}
        onClose={() => setPicking(false)}
        onPick={(from, to) => {
          setPicking(false);
          setQuery({ kind: "custom", from, to });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxxl },
  center: { textAlign: "center" },
  stale: { opacity: 0.45 },
  notice: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.attentionTint,
  },
  failed: { padding: space.xl, paddingTop: space.xxxl, gap: space.lg },
  empty: {
    marginHorizontal: space.lg,
    marginTop: space.xl,
    padding: space.lg,
    gap: space.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
  },
  few: { marginHorizontal: space.lg, marginTop: space.lg, gap: 2 },
  skeleton: { marginHorizontal: space.lg, marginTop: space.lg, gap: space.md },
  bone: { backgroundColor: colors.skeleton, borderRadius: 6 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 100, marginVertical: space.md },
  bar: { flex: 1 },
  sheet: { flex: 1, backgroundColor: colors.surface },
  sheetContent: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
  },
  sheetSide: { flex: 1, alignItems: "flex-start" },
  sheetRight: { alignItems: "flex-end" },
  sheetTitle: { flexShrink: 1, textAlign: "center" },
});
