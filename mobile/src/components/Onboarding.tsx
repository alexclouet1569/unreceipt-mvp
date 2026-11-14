// The first run on the Receipts screen (the website's three steps, launch
// plan action 47): the private address, a first scan, then "you're all
// set". Shown while the server says so (no receipts, never finished) and,
// once started, until finished, even when the first receipt arrives
// mid-way. The scan button hides meanwhile: each step has its own action
// (DESIGN.md decision 2026-10-15). Finishing or skipping tells the server
// (POST /api/profile/onboarded), so it doesn't come back.
//
// Step 1 has three faces (the website's _first-run.tsx): "Connect your
// email" when Gmail / Outlook can be connected (the provider buttons, then
// the address as the second way in), "Your email is connected" once one
// is, or the private address alone. Until the mailboxes are known it shows
// placeholder shapes, so no button changes under the finger.

import { useEffect, useRef } from "react";
import { AccessibilityInfo, View, findNodeHandle } from "react-native";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn } from "react-native-reanimated";
import { fill, s } from "../i18n";
import { providerNames, type ConnectState, type MailboxProvider } from "../lib/mailboxes";
import { durations, fonts, radius, space, makeStyles, useColors } from "../theme";
import { BrandMark } from "./Brand";
import { Button } from "./Button";
import { ConnectButtons } from "./ConnectButtons";
import { ForwardingCard } from "./ForwardingCard";
import { PressableScale } from "./PressableScale";
import { ActionsSkeleton } from "./Skeleton";
import { Text } from "./Text";

/** What step 1 offers: the mailboxes as the Receipts screen knows them. */
export type OnboardingMailbox = {
  state: ConnectState;
  /** Configured providers, most likely first. */
  providers: MailboxProvider[];
  /** Connected addresses ("connected"). */
  emails: string[];
};

export type OnboardingStep = 1 | 2 | 3;

/** Progress dots in ink: the screen's one green is the step's button. */
function Dots({ step }: { step: OnboardingStep }) {
  const styles = useStyles();
  return (
    <View style={styles.dots} accessible accessibilityLabel={fill(s.onboarding.step, { n: step })}>
      {[1, 2, 3].map((n) => (
        <View key={n} style={[styles.dot, n <= step && styles.dotReached, n === step && styles.dotOn]} />
      ))}
    </View>
  );
}

export function Onboarding({
  step,
  address,
  onNext,
  onScan,
  onFinish,
  mailbox,
}: {
  step: OnboardingStep;
  address: string;
  onNext: () => void;
  onScan: () => void;
  onFinish: () => void;
  mailbox: OnboardingMailbox;
}) {
  const styles = useStyles();
  const colors = useColors();
  const face = step === 1 ? mailbox.state : null;
  const content =
    face === "offer"
      ? {
          title: s.mailboxes.connectYourEmail,
          body: fill(s.onboarding.connectBody, { providers: providerNames(mailbox.providers, s.mailboxes) }),
        }
      : face === "connected"
        ? {
            title: s.onboarding.connectedTitle,
            body: fill(s.onboarding.connectedBody, { emails: mailbox.emails.join(", ") }),
          }
        : step === 1
          ? { title: s.onboarding.addressTitle, body: s.onboarding.addressBody }
          : step === 2
        ? { title: s.onboarding.scanTitle, body: s.onboarding.scanBody }
        : { title: s.onboarding.doneTitle, body: s.onboarding.doneBody };
  // Each step replaces the button just pressed: VoiceOver moves to the new
  // step's title (after a moment, so the scanner sheet has closed when
  // step 3 comes from a scan, or the "Connected" alert when step 1 says the
  // email is connected). The first step is read as the screen opens; the
  // placeholder before step 1 is known doesn't count as a step.
  const unknown = face === "unknown";
  const titleRef = useRef<React.ComponentRef<typeof View>>(null);
  const first = useRef(true);
  useEffect(() => {
    if (unknown) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
      else AccessibilityInfo.announceForAccessibility(content.title);
    }, 450);
    return () => clearTimeout(timer);
  }, [content.title, unknown]);

  if (unknown) {
    return (
      <View style={styles.wrap}>
        <Dots step={step} />
        <View style={styles.mark}>
          <BrandMark size={40} variant="bare" />
        </View>
        <ActionsSkeleton lines={3} buttons={2} card />
      </View>
    );
  }

  return (
    <Animated.View key={step} entering={FadeIn.duration(durations.medium)} style={styles.wrap}>
      <Dots step={step} />
      <View style={styles.mark}>
        {step === 1 ? (
          <BrandMark size={40} variant="bare" />
        ) : (
          <SymbolView name={step === 2 ? "doc.viewfinder" : "checkmark"} size={28} weight="semibold" tintColor={colors.ink} />
        )}
      </View>
      <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={content.title}>
        <Text variant="displayLg" style={styles.center}>
          {content.title}
        </Text>
      </View>
      <Text variant="body" color={colors.inkMuted} style={styles.center}>
        {content.body}
      </Text>

      {face === "offer" ? (
        <View style={styles.address}>
          <ConnectButtons providers={mailbox.providers} />
          <Text variant="caption" color={colors.inkMuted} style={[styles.center, styles.or]}>
            {s.mailboxes.orForward}
          </Text>
          <ForwardingCard address={address} quiet />
          <GuideLink />
        </View>
      ) : face === "none" ? (
        <View style={styles.address}>
          <ForwardingCard address={address} quiet />
          <GuideLink />
        </View>
      ) : null}

      <View style={[styles.actions, face === "offer" && styles.actionsQuiet]}>
        {face === "offer" ? (
          <>
            {/* Quiet text buttons: the provider pair above are the step's choices. */}
            <QuietButton label={s.onboarding.next} color={colors.ink} onPress={onNext} />
            <QuietButton label={s.onboarding.skip} color={colors.inkMuted} onPress={onFinish} />
          </>
        ) : step === 1 ? (
          <>
            <Button label={s.onboarding.next} onPress={onNext} />
            {/* Outline, not plain: plain is green, and the step's button is the one green. */}
            <Button kind="outline" label={s.onboarding.skip} onPress={onFinish} />
          </>
        ) : step === 2 ? (
          <>
            <Button label={s.onboarding.scanAction} onPress={onScan} />
            <Button kind="outline" label={s.onboarding.later} onPress={onNext} />
          </>
        ) : (
          <Button label={s.onboarding.doneAction} onPress={onFinish} />
        )}
      </View>
    </Animated.View>
  );
}

function GuideLink() {
  const styles = useStyles();
  const colors = useColors();
  return (
    <PressableScale
      scaleTo={0.97}
      onPress={() => router.push("/account/forwarding")}
      accessibilityRole="link"
      style={styles.guide}
    >
      <Text variant="caption" color={colors.ink} style={styles.guideText}>
        {s.onboarding.addressGuide}
      </Text>
      <SymbolView name="chevron.right" size={12} weight="semibold" tintColor={colors.inkMuted} />
    </PressableScale>
  );
}

function QuietButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <PressableScale scaleTo={0.97} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.guide}>
      <Text variant="caption" color={color} style={styles.guideText}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { marginHorizontal: space.lg, marginTop: space.lg, gap: space.md, alignItems: "stretch" },
  dots: { flexDirection: "row", gap: 6, alignSelf: "center", marginBottom: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.hairline },
  dotReached: { backgroundColor: colors.ink },
  dotOn: { width: 18 },
  // The 64×64 mint square of the empty state (DESIGN.md).
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: space.sm,
  },
  center: { textAlign: "center" },
  address: { gap: space.sm, marginTop: space.sm },
  guide: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 44 },
  guideText: { fontFamily: fonts.semibold },
  actions: { gap: space.sm, marginTop: space.lg },
  actionsQuiet: { gap: 0, marginTop: space.sm },
  or: { marginTop: space.sm },
}));
