// The Insights charts, drawn with react-native-svg (no chart library, no
// native change). DESIGN.md "Charts": bars in --ink-muted, the bar you're
// on (or today's) in --brand-action, the period before as --hairline ghosts
// behind; no gradients, no shadows, amounts in Geist Mono. Touch and slide
// to read a bar (a tick in the hand per bar); VoiceOver swipes up and down
// through them. The chart grows in once per period.

import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { fill, locale, s } from "../../i18n";
import { formatMoney } from "../../lib/format";
import { bucketLabel, cumulative, todayIndex, type ReadyAnalytics } from "../../lib/insights";
import { colors, durations, fonts, space } from "../../theme";
import { Text } from "../Text";

const HEIGHT = 140;

/** Grows from the baseline when `token` (the period) changes. */
function useGrowIn(token: string) {
  const grow = useSharedValue(0);
  useEffect(() => {
    let reduce = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduce = on;
      grow.value = 0;
      grow.value = reduce ? 1 : withTiming(1, { duration: durations.medium, easing: Easing.bezier(0.32, 0.72, 0, 1) });
    });
  }, [token, grow]);
  return useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }], transformOrigin: "bottom" }));
}

/** Touch, slide and VoiceOver selection of one of `count` columns. */
function useScrub(count: number, width: number) {
  const [selected, setSelected] = useState<number | null>(null);
  const pick = (i: number | null) => {
    if (i === selected) return;
    if (i != null) void Haptics.selectionAsync();
    setSelected(i);
  };
  const at = (e: GestureResponderEvent) => {
    if (width <= 0 || count === 0) return null;
    const i = Math.floor((e.nativeEvent.locationX / width) * count);
    return Math.max(0, Math.min(count - 1, i));
  };
  const handlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // Keep the finger while sliding sideways; the list scrolls elsewhere.
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => pick(at(e)),
    onResponderMove: (e: GestureResponderEvent) => pick(at(e)),
  };
  return { selected, pick, handlers };
}

/** What the finger is on: words in Manrope, amounts in Geist Mono (DESIGN.md). */
type Part = { text: string; money?: boolean };

function Readout({ parts }: { parts: Part[] | null }) {
  return (
    <Text variant="caption" color={colors.inkMuted} numberOfLines={1} style={styles.readout}>
      {parts
        ? parts.map((p, i) => (
            <Text key={i} variant={p.money ? "amountRow" : "caption"} color={p.money ? colors.ink : colors.inkMuted}>
              {p.text}
            </Text>
          ))
        : " "}
    </Text>
  );
}

const spoken = (parts: Part[] | null) => (parts ? parts.map((p) => p.text).join("") : null);

/** Bars per day, week or month, with the period before as ghosts. */
export function BarChart({ a }: { a: ReadyAnalytics }) {
  const [width, setWidth] = useState(0);
  const n = a.buckets.length;
  const today = todayIndex(a);
  const visible = a.period.current ? (today >= 0 ? today + 1 : n) : n;
  const max = Math.max(1, ...a.buckets.map((b) => b.amount), ...a.previousBuckets);
  const grow = useGrowIn(a.period.key + a.period.kind);
  const money = (v: number) => formatMoney(v, a.currency, locale);
  const scrub = useScrub(n, width);
  const sel = scrub.selected != null && scrub.selected < n ? scrub.selected : null;

  const highest = a.buckets.reduce((best, b, i) => (b.amount > a.buckets[best].amount ? i : best), 0);
  const summary = fill(s.insights.chartSummary, {
    count: n,
    label: bucketLabel(a.buckets[highest], a.granularity, locale, true),
    amount: money(a.buckets[highest].amount),
  });
  const parts: Part[] | null =
    sel != null
      ? [{ text: `${bucketLabel(a.buckets[sel], a.granularity, locale, true)} · ` }, { text: money(a.buckets[sel].amount), money: true }]
      : null;
  const readout = spoken(parts);

  const slot = width / Math.max(1, n);
  const barW = Math.max(2, Math.min(28, slot * 0.62));
  const labelEvery = n <= 12 ? 1 : n <= 16 ? 2 : Math.ceil(n / 6);

  return (
    <View style={styles.wrap}>
      <Readout parts={parts} />
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={styles.plot}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={summary}
        accessibilityValue={readout ? { text: readout } : undefined}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const cur = sel ?? -1;
          scrub.pick(Math.max(0, Math.min(n - 1, cur + (e.nativeEvent.actionName === "increment" ? 1 : -1))));
        }}
        {...scrub.handlers}
      >
        {width > 0 ? (
          <Animated.View style={grow}>
            <Svg width={width} height={HEIGHT}>
              <Line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke={colors.hairline} strokeWidth={1} />
              {a.previousBuckets.slice(0, n).map((v, i) => {
                const h = (v / max) * (HEIGHT - 8);
                if (h <= 0) return null;
                const x = i * slot + (slot - barW) / 2 - 2;
                return <Rect key={`p${i}`} x={x} y={HEIGHT - h} width={barW + 4} height={h} rx={3} fill={colors.hairline} />;
              })}
              {a.buckets.map((b, i) => {
                if (i >= visible) return null;
                const h = Math.max(b.amount > 0 ? 3 : 0, (b.amount / max) * (HEIGHT - 8));
                if (h <= 0) return null;
                const x = i * slot + (slot - barW) / 2;
                const on = sel != null ? i === sel : i === today;
                return (
                  <Rect key={i} x={x} y={HEIGHT - h} width={barW} height={h} rx={3} fill={on ? colors.brandAction : colors.inkMuted} />
                );
              })}
            </Svg>
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.labels} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {a.buckets.map((b, i) => (
          <Text key={i} style={styles.label} color={colors.inkMuted} numberOfLines={1}>
            {i % labelEvery === 0 ? bucketLabel(b, a.granularity, locale) : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * A month as a running total: this month's line up to today, last month's
 * as a hairline behind it, so "am I spending faster?" reads at a glance.
 */
export function PaceChart({ a }: { a: ReadyAnalytics }) {
  const [width, setWidth] = useState(0);
  const n = a.buckets.length;
  const today = todayIndex(a);
  const lastDay = a.period.current ? Math.max(0, today) : n - 1;
  const now = useMemo(() => cumulative(a.buckets.map((b) => b.amount)), [a.buckets]);
  const before = useMemo(() => cumulative(a.previousBuckets), [a.previousBuckets]);
  const max = Math.max(1, ...now.slice(0, lastDay + 1), ...before);
  const grow = useGrowIn(a.period.key + a.period.kind);
  const money = (v: number) => formatMoney(v, a.currency, locale);
  const scrub = useScrub(n, width);
  const sel = scrub.selected != null ? Math.min(scrub.selected, n - 1) : null;

  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * (width - 8) + 4);
  const y = (v: number) => HEIGHT - 4 - (v / max) * (HEIGHT - 12);
  const path = (values: number[], upTo: number) =>
    values
      .slice(0, upTo + 1)
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

  const at = sel ?? lastDay;
  const shownBefore = before.length > 0 ? before[Math.min(at, before.length - 1)] : null;
  const dayName = bucketLabel(a.buckets[at], "day", locale, true);
  const parts: Part[] | null =
    sel != null
      ? [
          { text: `${fill(s.insights.byDay, { day: dayName })} · ` },
          { text: money(now[at]), money: true },
          ...(shownBefore != null
            ? [{ text: ` · ${s.insights.legendBefore} ` }, { text: money(shownBefore), money: true }]
            : []),
        ]
      : null;
  const readout = spoken(parts);
  const summary =
    shownBefore != null
      ? fill(s.insights.paceSummary, { amount: money(now[lastDay]), before: money(before[Math.min(lastDay, before.length - 1)]) })
      : fill(s.insights.paceSummaryNoBefore, { amount: money(now[lastDay]) });

  return (
    <View style={styles.wrap}>
      <Readout parts={parts} />
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={styles.plot}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={summary}
        accessibilityValue={readout ? { text: readout } : undefined}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const cur = sel ?? lastDay;
          scrub.pick(Math.max(0, Math.min(lastDay, cur + (e.nativeEvent.actionName === "increment" ? 1 : -1))));
        }}
        {...scrub.handlers}
      >
        {width > 0 ? (
          <Animated.View style={grow}>
            <Svg width={width} height={HEIGHT}>
              <Line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke={colors.hairline} strokeWidth={1} />
              {before.length > 1 ? (
                <Path d={path(before, before.length - 1)} stroke={colors.hairline} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ) : null}
              <Path d={path(now, lastDay)} stroke={colors.brandAction} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {sel != null ? (
                <Line x1={x(at)} x2={x(at)} y1={4} y2={HEIGHT} stroke={colors.hairline} strokeWidth={1} />
              ) : null}
              <Circle cx={x(Math.min(at, lastDay))} cy={y(now[Math.min(at, lastDay)])} r={4.5} fill={colors.brandAction} stroke={colors.card} strokeWidth={2} />
            </Svg>
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.key, { backgroundColor: colors.brandAction }]} />
        <Text variant="caption" color={colors.inkMuted}>
          {s.insights.legendNow}
        </Text>
        {before.length > 1 ? (
          <>
            <View style={[styles.key, styles.keyGap, { backgroundColor: colors.hairline }]} />
            <Text variant="caption" color={colors.inkMuted}>
              {s.insights.legendBefore}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.lg, marginTop: space.lg },
  readout: { minHeight: 20, marginBottom: space.xs },
  plot: { height: HEIGHT },
  labels: { flexDirection: "row", marginTop: space.xs },
  label: { flex: 1, textAlign: "center", fontFamily: fonts.medium, fontSize: 10, lineHeight: 13 },
  legend: { flexDirection: "row", alignItems: "center", marginTop: space.sm, gap: 6 },
  key: { width: 14, height: 3, borderRadius: 2 },
  keyGap: { marginLeft: space.md },
});
