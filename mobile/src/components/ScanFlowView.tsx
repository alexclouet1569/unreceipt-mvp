// The scan flow on one full screen over the app (DESIGN.md "Scan review and
// reading"), on the photo viewer's dark ground so a white receipt stands out.
//
// Review: what Apple's scanner took, big; Retake or Use. Several shots (the
// scanner always offers another page) are swiped through, each one can be
// removed, and the button says how many receipts they become.
// Reading: the receipt with a green scan line sweeping over it while the
// server reads it; its digital receipt then opens by itself (ScanProvider).
// Waiting for a connection, it says so and can be left: the scan stays in
// the list and finishes there.

import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { fill, s } from "../i18n";
import type { ReadingView, ScanFlow } from "../lib/scans/flow";
import { durations, fonts, radius, space, makeStyles, useColors } from "../theme";
import { Button } from "./Button";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/** The web capture sheet's loop (globals.css capture-scan): 2.4 s down and up. */
const SWEEP_MS = 1_200;
/** After this long reading, the user may leave and let it finish in the list. */
const LEAVE_AFTER_MS = 6_000;
/** A flat, faint band around the line (DESIGN.md: no gradients). */
const BAND = 18;

type Props = {
  flow: ScanFlow;
  view: ReadingView | null;
  onUse: () => void;
  onRetake: () => void;
  onRemoveDraft: (id: string) => void;
  onClose: () => void;
  onRetakeStuck: (scanId: string) => void;
  onRemoveStuck: (scanId: string) => void;
  onRetryStuck: (scanId: string) => void;
};

export function ScanFlowView(props: Props) {
  const styles = useStyles();
  return (
    <Animated.View
      entering={FadeIn.duration(durations.medium)}
      exiting={FadeOut.duration(durations.medium)}
      style={styles.screen}
      // VoiceOver stays on this screen, not the list under it.
      accessibilityViewIsModal
    >
      <StatusBar style="light" />
      {props.flow.phase === "review" ? <Review {...props} flow={props.flow} /> : <Reading {...props} flow={props.flow} />}
    </Animated.View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <PressableScale
      scaleTo={0.92}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={s.scan.close}
      hitSlop={8}
      style={styles.close}
    >
      <SymbolView name="xmark" size={17} tintColor={colors.white} weight="semibold" />
    </PressableScale>
  );
}

/** A second choice on the dark ground: white outline, white label. */
function DarkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <PressableScale scaleTo={0.97} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.darkButton}>
      <Text style={styles.darkLabel} color={colors.white} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

function useFocusOnMount(deps: unknown[]) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const node = ref.current ? findNodeHandle(ref.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function Review({ flow, onUse, onRetake, onRemoveDraft, onClose }: Props & { flow: Extract<ScanFlow, { phase: "review" }> }) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const count = flow.drafts.length;
  const many = count > 1;
  const at = Math.min(index, count - 1);
  const titleRef = useFocusOnMount([flow.drafts[0]?.id]);
  const scroll = useRef<ScrollViewInstance>(null);

  // After a removal the pager stays on a photo that exists.
  useEffect(() => {
    if (index > count - 1) {
      setIndex(count - 1);
      scroll.current?.scrollTo({ x: (count - 1) * width, animated: true });
    }
  }, [count, index, width]);

  // A new set of shots (Retake) starts at the first one.
  const firstId = flow.drafts[0]?.id;
  useEffect(() => {
    setIndex(0);
    scroll.current?.scrollTo({ x: 0, animated: false });
  }, [firstId]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)));
  };

  return (
    <View style={[styles.fill, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} />
        <View style={styles.headerMiddle}>
          <View ref={titleRef} accessible accessibilityRole="header">
            <Text style={styles.title} color={colors.white} numberOfLines={2}>
              {s.scan.reviewTitle}
            </Text>
          </View>
          {many ? (
            <Text variant="caption" color={colors.white} style={styles.counter}>
              {fill(s.scan.pageOf, { n: at + 1, total: count })}
            </Text>
          ) : null}
        </View>
        <View style={styles.closeSpace} />
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        scrollEnabled={many}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.fill}
      >
        {flow.drafts.map((d, i) => (
          <View key={d.id} style={[styles.page, { width }]}>
            <Image
              source={{ uri: d.fileUri }}
              style={styles.fill}
              contentFit="contain"
              transition={durations.short}
              accessible={many}
              accessibilityLabel={many ? fill(s.scan.pageOf, { n: i + 1, total: count }) : undefined}
            />
          </View>
        ))}
      </ScrollView>

      {many ? (
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {flow.drafts.map((d, i) => (
            <View key={d.id} style={[styles.dot, i === at && styles.dotOn]} />
          ))}
        </View>
      ) : null}

      <View style={styles.bottom}>
        <Text variant="caption" color={colors.white} style={styles.hint}>
          {many ? s.scan.reviewManyHint : s.scan.reviewHint}
        </Text>
        {many ? (
          <PressableScale
            scaleTo={0.96}
            onPress={() => onRemoveDraft(flow.drafts[at].id)}
            accessibilityRole="button"
            accessibilityLabel={`${s.scan.removePhoto}, ${fill(s.scan.pageOf, { n: at + 1, total: count })}`}
            style={styles.removeRow}
          >
            <SymbolView name="trash" size={15} tintColor={colors.white} weight="semibold" />
            <Text variant="caption" style={styles.removeLabel} color={colors.white}>
              {s.scan.removePhoto}
            </Text>
          </PressableScale>
        ) : null}
        <View style={styles.buttons}>
          <View style={styles.buttonCell}>
            <DarkButton label={s.scan.retake} onPress={onRetake} />
          </View>
          <View style={styles.buttonCell}>
            <Button label={many ? fill(s.scan.useMany, { count }) : s.scan.useOne} onPress={onUse} />
          </View>
        </View>
      </View>
    </View>
  );
}

/** The receipt with the green line sweeping over it; still when motion is reduced or nothing is read. */
function ScanningImage({ uri, sweeping, extra }: { uri: string; sweeping: boolean; extra: number }) {
  const styles = useStyles();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [ratio, setRatio] = useState<number | null>(null);
  // The receipt as large as fits: most of the width, at most half the screen high.
  const maxW = width - space.xxxl * 2;
  // Short phones (SE) keep room for the text and buttons at large text sizes.
  const maxH = height * (height < 700 ? 0.38 : 0.5);
  // Hidden until the photo's own shape is known, so the card never jumps.
  const r = ratio ?? 3 / 4;
  const w = Math.min(maxW, maxH * r);
  const h = w / r;
  const y = useSharedValue(0);
  const moving = sweeping && !reduced && ratio != null;

  useEffect(() => {
    if (!moving) {
      cancelAnimation(y);
      y.set(withTiming(0, { duration: durations.short }));
      return;
    }
    y.set(0);
    y.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.cubic) }), -1, true));
    return () => cancelAnimation(y);
  }, [moving, h, y]);

  const line = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() * h - BAND / 2 }] }));

  return (
    <View style={styles.scanWrap}>
      <View style={[styles.receipt, { width: w, height: h, opacity: ratio == null ? 0 : 1 }]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          // Contain: a long till receipt keeps its top and bottom.
          contentFit="contain"
          onLoad={(e) => {
            const { width: iw, height: ih } = e.source;
            setRatio(iw > 0 && ih > 0 ? Math.min(Math.max(iw / ih, 0.2), 1.4) : 3 / 4);
          }}
          onError={() => setRatio(3 / 4)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        {moving ? (
          <Animated.View style={[styles.sweep, { width: w }, line]} pointerEvents="none">
            <View style={styles.band} />
            <View style={styles.line} />
          </Animated.View>
        ) : null}
      </View>
      {extra > 0 ? (
        <View style={styles.extra}>
          <Text variant="caption" style={styles.extraLabel} color={colors.white}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PulsingDot() {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.set(withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(o);
  }, [o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.pulse, style]} />;
}

function Reading({
  flow,
  view,
  onClose,
  onRetakeStuck,
  onRemoveStuck,
  onRetryStuck,
}: Props & { flow: Extract<ScanFlow, { phase: "reading" }> }) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [canLeave, setCanLeave] = useState(false);
  const total = flow.ids.length;
  const v: ReadingView = view ?? { kind: "reading", done: 0, total };
  const reading = v.kind === "reading" || v.kind === "open";

  useEffect(() => {
    const t = setTimeout(() => setCanLeave(true), LEAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const title =
    v.kind === "stuck"
      ? s.scan[v.reason]
      : total > 1
        ? fill(s.scan.readingMany, { count: total })
        : s.scan.reading;
  const sub =
    v.kind === "slow"
      ? s.scan[v.message]
      : v.kind === "stuck"
        ? null
        : v.kind === "reading" && total > 1 && v.done > 0
          ? fill(s.scan.readingProgress, { done: v.done, total })
          : s.scan.readingSub;
  // Focus once; later changes are announced below rather than read twice.
  const titleRef = useFocusOnMount([]);
  // iOS has no live regions: say what changed (progress, waiting, stuck).
  const spoken = [title, sub].filter(Boolean).join(". ");
  const firstSpoken = useRef(true);
  useEffect(() => {
    if (firstSpoken.current) {
      firstSpoken.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);

  return (
    <View style={[styles.fill, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} />
      </View>
      <View style={styles.readingMiddle}>
        <ScanningImage uri={flow.images[0]} sweeping={reading} extra={total - 1} />
        <View style={styles.readingText}>
          <View style={styles.titleRow}>
            {reading ? <PulsingDot /> : null}
            <View ref={titleRef} accessible accessibilityRole="header" style={styles.titleShrink}>
              <Text style={styles.readingTitle} color={colors.white}>
                {title}
              </Text>
            </View>
          </View>
          {sub ? (
            <Text variant="caption" color={colors.white} style={styles.readingSub}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.bottom}>
        {v.kind === "stuck" ? (
          <View style={styles.buttons}>
            <View style={styles.buttonCell}>
              {v.reason === "failed" ? (
                <DarkButton label={s.scan.close} onPress={onClose} />
              ) : (
                <DarkButton label={s.scan.remove} onPress={() => onRemoveStuck(v.scanId)} />
              )}
            </View>
            <View style={styles.buttonCell}>
              {v.reason === "failed" ? (
                <Button label={s.common.retry} onPress={() => onRetryStuck(v.scanId)} />
              ) : (
                <Button label={s.scan.retake} onPress={() => onRetakeStuck(v.scanId)} />
              )}
            </View>
          </View>
        ) : v.kind === "slow" ? (
          <>
            <Text variant="caption" color={colors.white} style={styles.hint}>
              {s.scan.keptOnPhone}
            </Text>
            <Button label={s.scan.ok} onPress={onClose} />
          </>
        ) : canLeave ? (
          <Animated.View entering={FadeIn.duration(durations.medium)}>
            <DarkButton label={s.scan.background} onPress={onClose} />
          </Animated.View>
        ) : (
          // Keeps the receipt where it is when the button appears.
          <View style={styles.buttonSpace} />
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.photoGround, zIndex: 10 },
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, minHeight: 44 },
  headerMiddle: { flex: 1, alignItems: "center" },
  closeSpace: { width: 44 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.inkScrim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  counter: { opacity: 0.8 },
  page: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingBottom: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white, opacity: 0.35 },
  dotOn: { width: 16, opacity: 1 },
  bottom: { paddingHorizontal: space.lg, gap: space.md },
  hint: { textAlign: "center", opacity: 0.85 },
  removeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44 },
  removeLabel: { fontFamily: fonts.bold },
  buttons: { flexDirection: "row", gap: space.md },
  buttonCell: { flex: 1 },
  darkButton: {
    // The primary Button's height, so the pair lines up.
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  darkLabel: { fontFamily: fonts.bold, fontSize: 16 },
  buttonSpace: { minHeight: 52 },
  readingMiddle: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xl, paddingHorizontal: space.lg },
  scanWrap: { alignItems: "center", justifyContent: "center" },
  receipt: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.white },
  sweep: { position: "absolute", left: 0, top: 0, height: BAND, justifyContent: "center" },
  band: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.brand, opacity: 0.18 },
  line: { height: 2, backgroundColor: colors.brand },
  extra: {
    position: "absolute",
    right: -space.md,
    bottom: -space.md,
    minWidth: 36,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: space.sm,
    backgroundColor: colors.inkScrim,
    alignItems: "center",
    justifyContent: "center",
  },
  extraLabel: { fontFamily: fonts.bold },
  readingText: { alignItems: "center", gap: space.xs, maxWidth: 320 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  titleShrink: { flexShrink: 1 },
  readingTitle: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, textAlign: "center" },
  readingSub: { textAlign: "center", opacity: 0.85 },
}));
