// The forwarding guide for one mail provider: one step per screen (the
// website's wizard, src/app/app/(authed)/settings/forwarding), with Back and
// Next within thumb reach. Button names follow the language the user's mail
// shows (a switch for Gmail, Outlook and iCloud). The Gmail code and the
// test email are polled from GET /api/forwarding/status while their step is
// on screen. The step reached is kept, so the user can switch to the
// computer and come back.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, AppState, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import type { MobileForwarding, MobileForwardingStatus } from "@/lib/mobile/types";
import { useAuth } from "../../../auth/AuthProvider";
import { Button } from "../../../components/Button";
import { ForwardingCard } from "../../../components/ForwardingCard";
import { PressableScale } from "../../../components/PressableScale";
import { RichText } from "../../../components/RichText";
import { Text } from "../../../components/Text";
import { fill, LANGUAGE_NAMES, locale, s, type Locale } from "../../../i18n";
import { getForwardingStatus } from "../../../lib/api";
import { GUIDE, HAS_MAIL_LANGUAGE, stepPieces, type GuideProvider, type GuideStep } from "../../../lib/forwarding-guide";
import { useForwarding } from "../../../lib/useForwarding";
import { durations, fonts, radius, space, makeStyles, useColors } from "../../../theme";

const LANGS: Locale[] = ["en", "sv", "fr"];
const POLL_MS = 4_000;
const POLL_FOR_MS = 10 * 60_000;

function isProvider(p: unknown): p is GuideProvider {
  return typeof p === "string" && p in GUIDE;
}

/** GET /api/forwarding/status every few seconds while `on`, the app is open and for at most 10 minutes. */
function useStatus(on: boolean): MobileForwardingStatus | null {
  const [status, setStatus] = useState<MobileForwardingStatus | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (AppState.currentState === "active") {
        try {
          const next = await getForwardingStatus();
          if (alive) setStatus(next);
        } catch {
          // Offline or a hiccup: the next tick tries again.
        }
      }
      if (alive && Date.now() - started < POLL_FOR_MS) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void getForwardingStatus().then((next) => alive && setStatus(next)).catch(() => {});
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [on]);
  return status;
}

function copy(text: string) {
  void Clipboard.setStringAsync(text);
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  AccessibilityInfo.announceForAccessibility(s.common.copied);
}

function CopyBlock({ text }: { text: string }) {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <View style={styles.copyBlock}>
      <Text variant="caption" selectable style={styles.copyText}>
        {text}
      </Text>
      <Button
        label={copied ? s.common.copied : s.forwarding.copy}
        kind="outline"
        onPress={() => {
          copy(text);
          setCopied(true);
        }}
      />
    </View>
  );
}

function Words({ words }: { words: string[] }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.words}>
      <Text variant="caption" color={colors.inkMuted}>
        {s.forwarding.tapToCopy}
      </Text>
      <View style={styles.wordRow}>
        {words.map((w) => (
          <PressableScale
            key={w}
            scaleTo={0.94}
            onPress={() => copy(w)}
            accessibilityRole="button"
            accessibilityLabel={`${s.forwarding.copy}: ${w}`}
            style={styles.wordTarget}
          >
            <View style={styles.word}>
              <Text style={styles.wordText}>{w}</Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

// Gmail's labels for the confirmation step, quoted in the mail's language.
const CONFIRM_LABELS: Parameters<typeof stepPieces>[1] = { verify: ["gmail", "verify"], confirm: ["gmail", "confirmPage"] };

function CodeBox({
  status,
  data,
  mailLang,
}: {
  status: MobileForwardingStatus | null;
  data: MobileForwarding;
  mailLang: Locale;
}) {
  const styles = useStyles();
  const colors = useColors();
  const c = status?.confirmation ?? null;
  const address = c?.forAddress ?? s.forwarding.someGmail;
  // Gmail's email now carries a link and no code (2026-11-13). The server
  // sends confirmUrl only when it is exactly Gmail's own page and the
  // requesting Gmail is known.
  const link = c?.confirmUrl ?? null;
  const state = c?.autoConfirmed ? "auto" : !c ? "waiting" : link ? "link" : c.code ? "code" : "unreadable";
  // Our button only opens Google's page; Google's own Confirm is what
  // confirms, so the text names both. "confirm" falls back to the app's
  // word when an older server sends no label for it.
  const say = (template: string) =>
    stepPieces(template, CONFIRM_LABELS, data, mailLang, { address, confirm: s.forwarding.confirmWord });
  const plain = (template: string) => say(template).map((p) => p.text).join("");
  // Said once when Gmail's email lands (the screen polls for it).
  useEffect(() => {
    if (state === "waiting") return;
    // Success only when nothing is left to do; a neutral tap when the person
    // still has to act.
    if (state === "auto") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (state === "unreadable") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else void Haptics.selectionAsync();
    AccessibilityInfo.announceForAccessibility(
      state === "auto"
        ? plain(s.forwarding.codeAuto)
        : state === "link"
          ? `${plain(s.forwarding.codeLink)}${c?.ownInbox === false ? ` ${s.forwarding.codeNotYours}` : ""}`
          : state === "unreadable"
            ? s.forwarding.codeUnreadable
            : `${s.forwarding.codeLabel}: ${(c?.code ?? "").split("").join(" ")}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per state change
  }, [state]);
  const confirmButton = link ? (
    <Button label={s.forwarding.confirmInGmail} kind="outline" onPress={() => void WebBrowser.openBrowserAsync(link)} />
  ) : null;
  const codeCard = c?.code ? (
    <View style={styles.codeCard}>
      <Text variant="micro" color={colors.inkMuted}>
        {s.forwarding.codeLabel}
      </Text>
      <Text style={styles.code} selectable accessibilityLabel={`${s.forwarding.codeLabel}: ${c.code.split("").join(" ")}`}>
        {c.code}
      </Text>
      <Button label={s.forwarding.copy} kind="outline" onPress={() => copy(c.code as string)} />
    </View>
  ) : null;
  if (state === "auto") {
    return (
      <View style={styles.extra}>
        <RichText pieces={say(s.forwarding.codeAuto)} variant="body" />
        {confirmButton || codeCard ? (
          <>
            <RichText
              pieces={say(confirmButton ? s.forwarding.codeAutoFallback : s.forwarding.codeTyped)}
              variant="body"
              color={colors.inkMuted}
            />
            {confirmButton ?? codeCard}
          </>
        ) : null}
      </View>
    );
  }
  if (state === "waiting") {
    return (
      <Text variant="body" color={colors.inkMuted}>
        {s.forwarding.codeWaiting}
      </Text>
    );
  }
  if (state === "link") {
    return (
      <View style={styles.extra}>
        <RichText pieces={say(s.forwarding.codeLink)} variant="body" />
        {c?.ownInbox === false ? (
          <Text variant="body" color={colors.attentionDeep}>
            {s.forwarding.codeNotYours}
          </Text>
        ) : null}
        {confirmButton}
      </View>
    );
  }
  if (state === "code") {
    return (
      <View style={styles.extra}>
        <RichText pieces={say(s.forwarding.codeTyped)} variant="body" />
        {codeCard}
      </View>
    );
  }
  return (
    <Text variant="body" color={colors.attentionDeep}>
      {s.forwarding.codeUnreadable}
    </Text>
  );
}

function TestBox({ status, since }: { status: MobileForwardingStatus | null; since: number }) {
  const styles = useStyles();
  const colors = useColors();
  const arrived = status?.lastEmailAt ? Date.parse(status.lastEmailAt) >= since - 5_000 : false;
  useEffect(() => {
    if (!arrived) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(s.forwarding.testArrived);
  }, [arrived]);
  return (
    <View style={styles.extra}>
      <Text variant="body" color={colors.inkMuted}>
        {s.forwarding.testBody}
      </Text>
      <Text variant="body" color={arrived ? colors.ink : colors.inkMuted} style={arrived && styles.strong}>
        {arrived ? s.forwarding.testArrived : s.forwarding.testWaiting}
      </Text>
    </View>
  );
}

function PaidCheck() {
  const styles = useStyles();
  const colors = useColors();
  const [which, setWhich] = useState<"yahoo" | "proton" | null>(null);
  return (
    <View style={styles.extra}>
      <View style={styles.buttons}>
        {(["yahoo", "proton"] as const).map((id) => (
          <View key={id} style={styles.flex}>
            <Button
              label={s.forwarding[id]}
              kind={which === id ? "ink" : "outline"}
              selected={which === id}
              onPress={() => setWhich(id)}
            />
          </View>
        ))}
      </View>
      {which === "yahoo" ? <Text variant="body">{s.forwarding.yahooText}</Text> : null}
      {which === "proton" ? (
        <View style={styles.extra}>
          <Text variant="body">{s.forwarding.protonText}</Text>
          {[s.forwarding.proton1, s.forwarding.proton2, s.forwarding.proton3, s.forwarding.proton4, s.forwarding.proton5].map(
            (line, i) => (
              <Text key={line} variant="body" color={colors.inkMuted}>
                {`${i + 1}. ${line}`}
              </Text>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

function StepExtra({
  step,
  data,
  mailLang,
  status,
  since,
}: {
  step: GuideStep;
  data: MobileForwarding;
  mailLang: Locale;
  status: MobileForwardingStatus | null;
  since: number;
}) {
  const styles = useStyles();
  const extra = step.extra;
  if (!extra) return null;
  if (typeof extra === "object") {
    const keys = "open" in extra ? [extra.open] : extra.openEither;
    return (
      <View style={styles.extra}>
        {keys.map((k) => (
          <Button
            key={k}
            kind="outline"
            label={k === "outlookPersonal" ? s.forwarding.personal : k === "outlookWork" ? s.forwarding.work : s.forwarding.open}
            onPress={() => void WebBrowser.openBrowserAsync(data.links[k])}
          />
        ))}
      </View>
    );
  }
  switch (extra) {
    case "copyAddress":
      return data.address ? <ForwardingCard address={data.address} quiet /> : null;
    case "copyFilter":
      return <CopyBlock text={data.gmailFilter} />;
    case "outlookWords":
      return <Words words={data.outlookWords} />;
    case "icloudRest":
      return <Words words={data.icloudWords[mailLang].slice(1)} />;
    case "otherWords":
      return (
        <View style={styles.extra}>
          {data.address ? <ForwardingCard address={data.address} quiet /> : null}
          <Words words={data.allWords} />
        </View>
      );
    case "code":
      return <CodeBox status={status} data={data} mailLang={mailLang} />;
    case "test":
      return <TestBox status={status} since={since} />;
    case "paid":
      return <PaidCheck />;
  }
}

export default function GuideScreen() {
  const styles = useStyles();
  const colors = useColors();
  const params = useLocalSearchParams<{ provider: string }>();
  const provider: GuideProvider = isProvider(params.provider) ? params.provider : "other";
  const steps = GUIDE[provider];
  const { userId } = useAuth();
  const { data } = useForwarding(userId);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [mailLang, setMailLang] = useState<Locale>(locale);
  const [since, setSince] = useState(() => Date.now());

  // Where the user was, and the mail language they picked.
  const key = `guide:v1:${userId ?? ""}:${provider}`;
  useEffect(() => {
    AsyncStorage.multiGet([key, "guide:v1:lang"])
      .then(([[, step], [, lang]]) => {
        const n = Number(step);
        if (Number.isInteger(n) && n > 0 && n < steps.length) setIndex(n);
        if (lang === "en" || lang === "sv" || lang === "fr") setMailLang(lang);
      })
      .catch(() => {});
  }, [key, steps.length]);

  const go = useCallback(
    (next: number) => {
      void Haptics.selectionAsync();
      setIndex(next);
      void AsyncStorage.setItem(key, String(next)).catch(() => {});
      if (steps[next]?.extra === "test") setSince(Date.now());
    },
    [key, steps],
  );

  const step = steps[Math.min(index, steps.length - 1)];
  const polling = !done && (step.extra === "code" || step.extra === "test");
  const status = useStatus(polling);

  const pieces = useMemo(
    () =>
      data
        ? stepPieces(s.forwarding.steps[step.text], step.labels, data, mailLang, {
            word: data.icloudWords[mailLang][0] ?? "",
          })
        : [],
    [data, step, mailLang],
  );
  // Gmail's older email had a code: then the "leave the code box empty"
  // hint would contradict the box, which says to type it.
  const codeOnly = Boolean(
    status?.confirmation?.code && !status.confirmation.confirmUrl && !status.confirmation.autoConfirmed,
  );
  const hint = useMemo(
    () =>
      data && step.hint && !(step.id === "gmail-code" && codeOnly)
        ? stepPieces(s.forwarding.hints[step.hint], step.hintLabels, data, mailLang)
        : null,
    [data, step, mailLang, codeOnly],
  );

  // VoiceOver hears the new step after Back or Next (focus stays on the button).
  const spoken = `${fill(s.forwarding.stepOf, { n: Math.min(index, steps.length - 1) + 1, count: steps.length })}. ${pieces
    .map((p) => p.text)
    .join("")}`;
  const [announced, setAnnounced] = useState<string | null>(null);
  useEffect(() => {
    if (!data || done) return;
    if (announced !== null && announced !== step.id) AccessibilityInfo.announceForAccessibility(spoken);
    setAnnounced(step.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per step
  }, [step.id, data, done]);

  if (!data) return null;

  const name = s.forwarding.providers[provider];
  const last = index >= steps.length - 1;
  const code = status?.confirmation;
  const nextLabel = last
    ? s.forwarding.done
    : step.extra === "code" && (code?.code || code?.confirmUrl) && !code.autoConfirmed
      ? s.forwarding.verified
      : s.forwarding.next;

  const finish = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void AsyncStorage.removeItem(key).catch(() => {});
    setDone(true);
  };

  if (done) {
    const paid = provider === "paid";
    return (
      <SafeAreaView edges={["bottom"]} style={styles.screen}>
        <Stack.Screen options={{ title: name }} />
        <Animated.View entering={FadeIn.duration(durations.medium)} style={styles.doneBody}>
          <Text variant="displayLg">{paid ? s.forwarding.handDoneTitle : s.forwarding.doneTitle}</Text>
          <Text variant="body" color={colors.inkMuted}>
            {paid ? s.forwarding.handDoneBody : fill(s.forwarding.doneBody, { provider: name })}
          </Text>
        </Animated.View>
        <View style={styles.bar}>
          <View style={styles.flex}>
            <Button label={s.forwarding.done} onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <Stack.Screen options={{ title: name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text variant="micro" color={colors.inkMuted}>
          {fill(s.forwarding.stepOf, { n: index + 1, count: steps.length })}
        </Text>
        {HAS_MAIL_LANGUAGE[provider] ? (
          <View style={styles.langRow} accessibilityRole="radiogroup" accessibilityLabel={fill(s.forwarding.mailIn, { provider: name })}>
            <Text variant="caption" color={colors.inkMuted}>
              {fill(s.forwarding.mailIn, { provider: name })}
            </Text>
            {LANGS.map((id) => (
              <PressableScale
                key={id}
                scaleTo={0.94}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMailLang(id);
                  void AsyncStorage.setItem("guide:v1:lang", id).catch(() => {});
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: mailLang === id }}
                accessibilityLabel={LANGUAGE_NAMES[id]}
                style={styles.langTarget}
              >
                <View style={[styles.lang, mailLang === id && styles.langActive]}>
                  <Text style={styles.langText} color={mailLang === id ? colors.ink : colors.inkMuted}>
                    {LANGUAGE_NAMES[id]}
                  </Text>
                </View>
              </PressableScale>
            ))}
          </View>
        ) : null}

        <Animated.View key={step.id} entering={FadeIn.duration(durations.short)} style={styles.step}>
          <Text variant="caption" color={colors.inkMuted} accessibilityRole="header">
            {s.forwarding.chapters[step.chapter]}
          </Text>
          <RichText pieces={pieces} variant="bodyLg" />
          <StepExtra step={step} data={data} mailLang={mailLang} status={status} since={since} />
          {hint ? <RichText pieces={hint} variant="caption" color={colors.inkMuted} /> : null}
        </Animated.View>
      </ScrollView>

      <View style={styles.bar}>
        <View style={styles.flex}>
          <Button
            label={s.forwarding.back}
            kind="outline"
            onPress={() => (index === 0 ? router.back() : go(index - 1))}
          />
        </View>
        <View style={styles.flex}>
          <Button label={nextLabel} onPress={() => (last ? finish() : go(index + 1))} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  step: { gap: space.md },
  extra: { gap: space.sm },
  strong: { fontFamily: fonts.semibold },
  bar: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  flex: { flex: 1 },
  buttons: { flexDirection: "row", gap: space.sm },
  doneBody: { flex: 1, padding: space.xl, paddingTop: space.xxxl, gap: space.md },
  langRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.xs },
  langTarget: { minHeight: 44, justifyContent: "center" },
  lang: {
    height: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  langActive: { backgroundColor: colors.card, borderColor: colors.ink },
  langText: { fontFamily: fonts.semibold, fontSize: 13 },
  copyBlock: {
    gap: space.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: 14,
  },
  copyText: { color: colors.ink },
  words: { gap: space.xs },
  wordRow: { flexDirection: "row", flexWrap: "wrap", columnGap: space.xs },
  wordTarget: { minHeight: 44, justifyContent: "center" },
  word: {
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  wordText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  codeCard: {
    gap: space.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: 14,
  },
  code: { fontFamily: fonts.bold, fontSize: 32, letterSpacing: 4, color: colors.ink, fontVariant: ["tabular-nums"] },
}));
