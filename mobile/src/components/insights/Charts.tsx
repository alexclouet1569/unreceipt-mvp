// The Insights chart, drawn with react-native-svg (no chart library, no
// native change). DESIGN.md "Charts and Insights": bars in --ink-muted, the
// bar you're on (or the current one) in --brand-action, the period before
// in --ink-faint (beside each bar when there are few, behind when many);
// no gradients, no shadows, amounts in Geist Mono. Slide sideways to read a
// bar (a tick in the hand per bar); VoiceOver swipes up and down through
// them. The chart grows in once per period.

import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { fill, locale, s } from "../../i18n";
import { formatMoney } from "../../lib/format";
import {
  bucketLabel,
  partsText,
  periodTitle,
  previousLabel,
  todayIndex,
  type Part,
  type ReadyAnalytics,
} from "../../lib/insights";
import { durations, fonts, space, useColors } from "../../theme";
import { Text } from "../Text";
import { Parts } from "./Parts";

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

/**
 * Slide sideways over the chart to read it (a tick per column); a vertical
 * swipe stays the list's scroll. The selection clears a moment after the
 * finger lifts, so today's bar comes back. `last`: the last column that
 * can be read (the future has nothing).
 */
function useScrub(count: number, width: number, last: number) {
  const [selected, setSelected] = useState<number | null>(null);
  const current = useRef<number | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geometry = useRef({ count, width, last });
  geometry.current = { count, width, last };
  const pick = (i: number | null) => {
    if (clear.current) clearTimeout(clear.current);
    if (i === current.current) return;
    if (i != null) void Haptics.selectionAsync();
    current.current = i;
    setSelected(i);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const at = (x: number) => {
    const g = geometry.current;
    if (g.width <= 0 || g.count === 0) return null;
    return Math.max(0, Math.min(g.last, Math.floor((x / g.width) * g.count)));
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => pickRef.current(at(e.nativeEvent.locationX)),
        onPanResponderMove: (e) => pickRef.current(at(e.nativeEvent.locationX)),
        onPanResponderRelease: () => {
          clear.current = setTimeout(() => pickRef.current(null), 1_600);
        },
        onPanResponderTerminate: () => pickRef.current(null),
      }),
    [],
  );
  useEffect(() => () => {
    if (clear.current) clearTimeout(clear.current);
  }, []);
  return { selected: selected != null ? Math.min(selected, last) : null, pick, handlers: responder.panHandlers };
}

/** What the finger is on (two lines at most, so no amount is ever cut). */
function Readout({ parts }: { parts: Part[] | null }) {
  return (
    <View style={styles.readout}>
      {parts ? <Parts parts={parts} numberOfLines={2} maxFontSizeMultiplier={1.2} /> : null}
    </View>
  );
}

const spoken = (parts: Part[] | null) => (parts ? partsText(parts) : null);

/** Bar labels laid out on their bar, every `every`th one, never cut. */
function AxisLabels({ labels, width }: { labels: string[]; width: number }) {
  const colors = useColors();
  const n = labels.length;
  const slot = width / Math.max(1, n);
  // About 6 pt per character at 10 pt: room for the longest label.
  const longest = Math.max(1, ...labels.map((l) => l.length));
  const every = Math.max(1, Math.ceil((longest * 6 + 6) / Math.max(1, slot)));
  return (
    <View style={[styles.labels, { width }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {labels.map((l, i) =>
        i % every === 0 ? (
          <Text
            key={i}
            style={[styles.label, { left: i * slot + slot / 2 - (slot * every) / 2, width: slot * every }]}
            color={colors.inkMuted}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
          >
            {l}
          </Text>
        ) : null,
      )}
    </View>
  );
}

/** Bars per day, week or month, with the period before as ghosts. */
export function BarChart({ a }: { a: ReadyAnalytics }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const n = a.buckets.length;
  const today = todayIndex(a);
  const visible = a.period.current ? (today >= 0 ? today + 1 : n) : n;
  const max = Math.max(1, ...a.buckets.map((b) => b.amount), ...a.previousBuckets);
  const grow = useGrowIn(a.period.key + a.period.kind);
  const money = (v: number) => formatMoney(v, a.currency, locale);
  const scrub = useScrub(n, width, Math.max(0, visible - 1));
  const sel = scrub.selected;

  const highest = a.buckets.reduce((best, b, i) => (b.amount > a.buckets[best].amount ? i : best), 0);
  const summary = fill(s.insights.chartSummary, {
    count: n,
    label: bucketLabel(a.buckets[highest], a.granularity, locale, true),
    amount: money(a.buckets[highest].amount),
  });
  const before = sel != null && a.previousBuckets.length > sel ? a.previousBuckets[sel] : null;
  const parts: Part[] | null =
    sel != null
      ? [
          { text: `${bucketLabel(a.buckets[sel], a.granularity, locale, true)} · ` },
          { text: money(a.buckets[sel].amount), money: true },
          ...(before != null ? [{ text: ` · ${previousLabel(a, locale, s)} ` }, { text: money(before), money: true }] : []),
        ]
      : null;
  const readout = spoken(parts);

  const slot = width / Math.max(1, n);
  // Few bars (a month's weeks, a quarter's months…): last period's bar
  // stands beside this one. Many: it sits behind, a little wider.
  const paired = a.previousBuckets.length > 0 && n <= 8;
  const barW = paired ? Math.min(30, slot * 0.34) : Math.max(2, Math.min(28, slot * 0.62));
  const gap = 4;

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
          scrub.pick(Math.max(0, Math.min(visible - 1, cur + (e.nativeEvent.actionName === "increment" ? 1 : -1))));
        }}
        {...scrub.handlers}
      >
        {width > 0 ? (
          <Animated.View style={grow}>
            <Svg width={width} height={HEIGHT}>
              <Line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke={colors.hairline} strokeWidth={1} />
              {a.previousBuckets.slice(0, n).map((v, i) => {
                const h = Math.max(v > 0 ? 3 : 0, (v / max) * (HEIGHT - 8));
                if (h <= 0) return null;
                const x = paired ? i * slot + slot / 2 - gap / 2 - barW : i * slot + (slot - barW) / 2 - 2;
                return (
                  <Rect key={`p${i}`} x={x} y={HEIGHT - h} width={paired ? barW : barW + 4} height={h} rx={3} fill={colors.inkFaint} />
                );
              })}
              {a.buckets.map((b, i) => {
                if (i >= visible) return null;
                const h = Math.max(b.amount > 0 ? 3 : 0, (b.amount / max) * (HEIGHT - 8));
                if (h <= 0) return null;
                const x = paired ? i * slot + slot / 2 + gap / 2 : i * slot + (slot - barW) / 2;
                const on = sel != null ? i === sel : i === today;
                // While a bar is chosen the others dim, so the choice reads by
                // lightness too, not only by hue (on dark the green and the
                // muted bars are almost equally light).
                return (
                  <Rect
                    key={i}
                    x={x}
                    y={HEIGHT - h}
                    width={barW}
                    height={h}
                    rx={3}
                    fill={on ? colors.brandAction : colors.inkMuted}
                    opacity={sel != null && !on ? 0.45 : 1}
                  />
                );
              })}
            </Svg>
          </Animated.View>
        ) : null}
      </View>
      {width > 0 ? <AxisLabels labels={a.buckets.map((b) => bucketLabel(b, a.granularity, locale))} width={width} /> : null}
      {a.previousBuckets.length > 0 ? (
        <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={[styles.key, { backgroundColor: colors.inkMuted }]} />
          <Text variant="caption" color={colors.inkMuted}>
            {periodTitle(a.period, locale, s)}
          </Text>
          <View style={[styles.key, styles.keyGap, { backgroundColor: colors.inkFaint }]} />
          <Text variant="caption" color={colors.inkMuted}>
            {previousLabel(a, locale, s)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.lg, marginTop: space.lg },
  readout: { minHeight: 38, justifyContent: "flex-end", marginBottom: space.xs },
  plot: { height: HEIGHT },
  labels: { height: 16, marginTop: space.xs },
  label: { position: "absolute", top: 0, textAlign: "center", fontFamily: fonts.medium, fontSize: 10, lineHeight: 13 },
  legend: { flexDirection: "row", alignItems: "center", marginTop: space.sm, gap: 6 },
  key: { width: 10, height: 10, borderRadius: 3 },
  keyGap: { marginLeft: space.md },
});
