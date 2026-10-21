"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntakeRow } from "@/components/IntakeRow";
import { RECEIPT_SUBJECT_WORDS, gmailFilterQuery, outlookSubjectWords } from "@/lib/forwarding-filters";
import { useI18n } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/messages";

/**
 * Step-by-step forwarding setup: pick your email provider, then one small
 * step per screen with the exact click path, a button that opens the right
 * settings page, and the things to paste. Gmail's confirmation code and the
 * test email are picked up live from /api/forwarding/status.
 */

type Provider = "gmail" | "outlook" | "other";

type Status = {
  confirmation: { code: string | null; forAddress: string | null; receivedAt: string } | null;
  lastEmailAt: string | null;
};

type StepKind = "plain" | "code" | "test";

type Step = {
  title: string;
  // The click path inside the provider's settings, shown as a trail.
  path: string[];
  kind?: StepKind;
  body: (ctx: StepContext) => React.ReactNode;
};

type StepContext = {
  forwardingEmail: string;
  status: Status | null;
};

const GMAIL_FORWARDING_URL = "https://mail.google.com/mail/u/0/#settings/fwdandpop";
const GMAIL_FILTERS_URL = "https://mail.google.com/mail/u/0/#settings/filters";
const OUTLOOK_PERSONAL_RULES_URL = "https://outlook.live.com/mail/0/options/mail/rules";
const OUTLOOK_WORK_RULES_URL = "https://outlook.office.com/mail/options/mail/rules";

const POLL_MS = 4_000;
const POLL_FOR_MS = 10 * 60 * 1000;
const STORAGE_KEY = "unreceipt.forwarding-wizard";

// When the test step opened; only an email after that counts as the test.
const nowMs = () => Date.now();

type WizardMessages = Messages["settings"]["wizard"];

function providers(t: WizardMessages): { id: Provider; label: string; hint: string }[] {
  return [
    { id: "gmail", label: "Gmail", hint: t.providers.gmailHint },
    { id: "outlook", label: "Outlook", hint: t.providers.outlookHint },
    { id: "other", label: t.providers.other, hint: t.providers.otherHint },
  ];
}

// Gmail and Outlook menu names as their French and Swedish UIs show them.
function buildSteps(t: WizardMessages): Record<Provider, Step[]> {
  const check: Step = {
    title: t.checkTitle,
    path: [],
    kind: "test",
    body: (ctx) => <TestBox {...ctx} />,
  };
  return {
    gmail: [
      {
        title: t.gmail.openTitle,
        path: t.gmail.openPath,
        body: () => (
          <>
            <OpenLink href={GMAIL_FORWARDING_URL}>{t.gmail.openLink}</OpenLink>
            <Hint>{t.gmail.openHint}</Hint>
          </>
        ),
      },
      {
        title: t.gmail.addTitle,
        path: t.gmail.addPath,
        body: ({ forwardingEmail }) => (
          <>
            <IntakeRow callout={t.yourAddress} value={forwardingEmail} mono copyLabel={t.copyAddress} quiet />
            <Hint>{t.gmail.addHint}</Hint>
          </>
        ),
      },
      {
        title: t.gmail.codeTitle,
        path: t.gmail.codePath,
        kind: "code",
        body: ({ status }) => (
          <>
            <CodeBox status={status} />
            <Hint>
              {t.gmail.codeHintBefore} <Strong>{t.gmail.codeHintStrong}</Strong> {t.gmail.codeHintAfter}
            </Hint>
          </>
        ),
      },
      {
        title: t.gmail.filterTitle,
        path: t.gmail.filterPath,
        body: () => (
          <>
            <OpenLink href={GMAIL_FILTERS_URL}>{t.gmail.filterLink}</OpenLink>
            <IntakeRow
              callout={t.gmail.filterPaste}
              value={gmailFilterQuery()}
              mono={false}
              copyLabel={t.gmail.copyFilter}
              breakWords
              quiet
            />
            <Hint>{t.gmail.filterHint}</Hint>
          </>
        ),
      },
      check,
    ],
    outlook: [
      {
        title: t.outlook.openTitle,
        path: t.outlook.openPath,
        body: () => (
          <>
            <div className="flex flex-wrap gap-2">
              <OpenLink href={OUTLOOK_PERSONAL_RULES_URL}>{t.outlook.personal}</OpenLink>
              <OpenLink href={OUTLOOK_WORK_RULES_URL}>{t.outlook.work}</OpenLink>
            </div>
            <Hint>{t.outlook.openHint}</Hint>
          </>
        ),
      },
      {
        title: t.outlook.whichTitle,
        path: t.outlook.whichPath,
        body: () => (
          <>
            <p className="text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
              {t.outlook.whichBody}
            </p>
            <WordChips words={outlookSubjectWords()} />
          </>
        ),
      },
      {
        title: t.outlook.sendTitle,
        path: t.outlook.sendPath,
        body: ({ forwardingEmail }) => (
          <>
            <IntakeRow callout={t.yourAddress} value={forwardingEmail} mono copyLabel={t.copyAddress} quiet />
            <Hint>
              {t.outlook.sendHintBefore} <Strong>{t.outlook.sendHintStrong}</Strong>
              {t.outlook.sendHintAfter}
            </Hint>
          </>
        ),
      },
      check,
    ],
    other: [
      {
        title: t.other.findTitle,
        path: t.other.findPath,
        body: () => <Hint>{t.other.findHint}</Hint>,
      },
      {
        title: t.other.ruleTitle,
        path: t.other.rulePath,
        body: ({ forwardingEmail }) => (
          <>
            <IntakeRow callout={t.forwardTo} value={forwardingEmail} mono copyLabel={t.copyAddress} quiet />
            <p className="text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
              {t.other.ruleWords}
            </p>
            <WordChips words={[...RECEIPT_SUBJECT_WORDS]} />
            <Hint>{t.other.ruleHint}</Hint>
          </>
        ),
      },
      check,
    ],
  };
}

type Saved = { provider: Provider | null; step: number; done: boolean };

const PROVIDER_IDS: readonly Provider[] = ["gmail", "outlook", "other"];

function loadSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    if (parsed && (parsed.provider === null || (parsed.provider && PROVIDER_IDS.includes(parsed.provider)))) {
      return { provider: parsed.provider ?? null, step: Math.max(0, Number(parsed.step) || 0), done: Boolean(parsed.done) };
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  return { provider: null, step: 0, done: false };
}

function save(state: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: progress just isn't remembered */
  }
}

// Phones and tablets: Gmail and Outlook only allow rules in a desktop browser.
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const isCoarse = () => window.matchMedia("(pointer: coarse)").matches;

export function ForwardingWizard({ forwardingEmail }: { forwardingEmail: string }) {
  const t = useI18n().t.settings.wizard;
  const STEPS = buildSteps(t);
  const PROVIDERS = providers(t);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const onPhone = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restored = useRef(false);

  // Pick up where the user left off (e.g. after switching to the Gmail tab
  // and back, or reloading). Deferred so server and client render alike.
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = loadSaved();
      setProvider(saved.provider);
      setStep(saved.step);
      setDone(saved.done);
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (restored.current) save({ provider, step, done });
  }, [provider, step, done]);

  const steps = provider ? STEPS[provider] : [];
  const current = provider && !done ? steps[Math.min(step, steps.length - 1)] : null;
  const watching = current?.kind === "code" || current?.kind === "test";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/forwarding/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      /* offline for a moment: the next poll retries */
    }
  }, []);

  // Live updates only while a step is waiting for something to arrive.
  useEffect(() => {
    if (!watching) return;
    const started = Date.now();
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) return clearInterval(timer);
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - started <= POLL_FOR_MS) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [watching, refresh]);

  const goTo = (next: number) => {
    if (!provider) return;
    setStep(next);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const choose = (p: Provider) => {
    setProvider(p);
    setDone(false);
    setStep(0);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const restart = () => {
    setProvider(null);
    setStep(0);
    setDone(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const total = steps.length;
  const index = Math.min(step, Math.max(0, total - 1));

  return (
    <div
      className="bg-card"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}
    >
      {onPhone ? <PhoneNotice /> : null}

      {!provider ? (
        <>
          <Title titleRef={titleRef}>{t.chooseTitle}</Title>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}>
            {t.chooseBody}
          </p>
          <ul role="list" className="space-y-2">
            {PROVIDERS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  className="w-full flex items-center justify-between gap-3 text-left bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  style={{ border: "1px solid var(--hairline)", borderRadius: "10px", padding: "12px 14px", minHeight: "56px" }}
                >
                  <span>
                    <span className="block text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
                      {p.label}
                    </span>
                    <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                      {p.hint}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : done ? (
        <>
          <div className="flex items-center gap-2" style={{ marginBottom: "8px" }}>
            <Check className="w-5 h-5 text-[var(--primary)]" aria-hidden="true" />
            <Title titleRef={titleRef}>{t.setTitle}</Title>
          </div>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}>
            {t.setBody(PROVIDERS.find((p) => p.id === provider)?.label ?? "")}
          </p>
          <button
            type="button"
            onClick={restart}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2 transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
            style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
          >
            {t.setupAnother}
          </button>
        </>
      ) : current ? (
        <>
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: "8px" }}>
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {t.stepOf(PROVIDERS.find((p) => p.id === provider)?.label ?? "", index + 1, total)}
            </p>
            <Dots total={total} index={index} />
          </div>
          <Title titleRef={titleRef}>{current.title}</Title>
          {current.path.length > 0 ? <PathTrail path={current.path} /> : null}
          <div className="space-y-3" style={{ marginTop: "12px" }}>
            {current.body({ forwardingEmail, status })}
          </div>

          <div className="flex items-center justify-between gap-2" style={{ marginTop: "20px" }}>
            <button
              type="button"
              onClick={() => (index === 0 ? restart() : goTo(index - 1))}
              className="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
              style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {index === 0 ? t.changeEmail : t.back}
            </button>
            <Button
              type="button"
              className="h-11 px-5"
              onClick={() => {
                if (index < total - 1) return goTo(index + 1);
                setDone(true);
                requestAnimationFrame(() => titleRef.current?.focus());
              }}
            >
              {index === total - 1 ? t.done : current.kind === "code" && status?.confirmation?.code ? t.verified : t.next}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// "Settings (gear) › See all settings › Forwarding and POP/IMAP"
function PathTrail({ path }: { path: string[] }) {
  const t = useI18n().t.settings.wizard;
  return (
    <ol role="list" aria-label={t.whereToClick} className="flex flex-wrap items-center gap-1" style={{ marginTop: "8px" }}>
      {path.map((p, i) => (
        <li key={`${p}-${i}`} className="inline-flex items-center gap-1">
          {/* Read-only labels, styled unlike the bordered buttons around them. */}
          <span
            className="text-[var(--ink)]"
            style={{ background: "var(--surface)", borderRadius: "6px", padding: "4px 8px", fontSize: "13px", fontWeight: 600 }}
          >
            {p}
          </span>
          {i < path.length - 1 ? <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-faint)]" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  const t = useI18n().t.settings.wizard;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-[var(--ink)] bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      style={{ border: "1px solid var(--hairline)", borderRadius: "10px", padding: "0 14px", minHeight: "44px", fontSize: "14px", fontWeight: 600 }}
    >
      {children}
      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="sr-only">{t.opensNewTab}</span>
    </a>
  );
}

function CodeBox({ status }: { status: Status | null }) {
  const t = useI18n().t.settings.wizard.code;
  const confirmation = status?.confirmation ?? null;
  return (
    <div role="status">
      {!confirmation ? (
        <p
          className="flex items-center gap-2 text-[var(--ink-muted)]"
          style={{ border: "1px dashed var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px" }}
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          {t.waiting}
        </p>
      ) : !confirmation.code ? (
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          {t.unreadableBefore}{" "}
          <a href="mailto:support@unreceipt.com" className="underline underline-offset-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2">
            support@unreceipt.com
          </a>{" "}
          {t.unreadableAfter}
        </p>
      ) : (
        <IntakeRow callout={t.callout} value={confirmation.code} mono={false} copyLabel={t.copy} quiet />
      )}
    </div>
  );
}

function TestBox({ status }: StepContext) {
  const t = useI18n().t.settings.wizard.test;
  const [since] = useState(nowMs);
  const arrived = status?.lastEmailAt != null && Date.parse(status.lastEmailAt) >= since - 5_000;
  return (
    <>
      <p className="text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
        {t.askBefore} <Strong>{t.subject}</Strong>
        {t.askAfter}
      </p>
      <div role="status">
        {arrived ? (
          <p
            className="flex items-center gap-2 text-[var(--ink)]"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px", fontWeight: 600 }}
          >
            <Check className="w-4 h-4 text-[var(--primary)] shrink-0" aria-hidden="true" />
            {t.worked}
          </p>
        ) : (
          <p
            className="flex items-center gap-2 text-[var(--ink-muted)]"
            style={{ border: "1px dashed var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px" }}
          >
            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
            {t.waiting}
          </p>
        )}
      </div>
      <Hint>
        {t.ownBefore}{" "}
        <a href="#own-heading" className="underline underline-offset-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2">
          {t.ownLink}
        </a>{" "}
        {t.ownAfter}
      </Hint>
    </>
  );
}

function WordChips({ words }: { words: readonly string[] }) {
  const t = useI18n().t.settings.wizard.words;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (w: string) => {
    try {
      await navigator.clipboard.writeText(w);
      setCopied(w);
      setTimeout(() => setCopied((c) => (c === w ? null : c)), 1500);
    } catch {
      /* no clipboard: the word is visible to type */
    }
  };
  return (
    <>
      <ul role="list" aria-label={t.label} className="flex flex-wrap gap-2">
        {words.map((w) => (
          <li key={w}>
            <button
              type="button"
              onClick={() => copy(w)}
              aria-label={t.copy(w)}
              className="inline-flex items-center gap-1 text-[var(--ink)] bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              style={{ border: "1px solid var(--hairline)", borderRadius: "6px", padding: "0 10px", minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
            >
              {copied === w ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : null}
              {w}
            </button>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {copied ? t.copied(copied) : ""}
      </p>
    </>
  );
}

function PhoneNotice() {
  const t = useI18n().t.settings.wizard.phone;
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const send = async () => {
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/forwarding/send-link", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { sentTo?: string; error?: string };
      if (!res.ok) {
        setState("error");
        setMessage(body.error ?? t.failed);
        return;
      }
      setState("sent");
      setMessage(t.sentTo(body.sentTo ?? ""));
    } catch {
      setState("error");
      setMessage(t.failedNetwork);
    }
  };
  return (
    <div
      className="space-y-2"
      style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: "16px", marginBottom: "16px" }}
    >
      <p className="text-[var(--ink)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        <Strong>{t.best}</Strong> {t.bestBody}
      </p>
      {/* Stays mounted (disabled once sent) so focus isn't lost. */}
      <button
        type="button"
        onClick={send}
        disabled={state === "sending" || state === "sent"}
        className="inline-flex items-center gap-2 text-[var(--ink)] bg-card hover:bg-[var(--surface)] transition-colors duration-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
        style={{ border: "1px solid var(--hairline)", borderRadius: "10px", padding: "0 14px", minHeight: "44px", fontSize: "14px", fontWeight: 600 }}
      >
        {state === "sending" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
        {state === "sent" ? <Check className="w-4 h-4" aria-hidden="true" /> : null}
        {state === "sent" ? t.sent : t.emailMe}
      </button>
      <p
        role="status"
        className={state === "error" ? "text-sm rounded-[10px] px-3 py-2 text-[var(--attention-deep)]" : "text-[var(--ink-muted)]"}
        style={state === "error" ? { background: "var(--attention-tint)" } : { fontSize: "14px" }}
      >
        {message}
      </p>
    </div>
  );
}

function Dots({ total, index }: { total: number; index: number }) {
  return (
    <div className="flex gap-2" aria-hidden="true">
      {Array.from({ length: total }, (_, n) => (
        <span
          key={n}
          className="block rounded-full"
          style={{
            width: n === index ? "16px" : "6px",
            height: "6px",
            background: n <= index ? "var(--ink)" : "var(--hairline)",
            transition: "width 200ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      ))}
    </div>
  );
}

function Title({ children, titleRef }: { children: React.ReactNode; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <h3
      ref={titleRef}
      tabIndex={-1}
      className="font-display font-bold text-[var(--ink)] outline-none"
      style={{ fontSize: "18px", letterSpacing: "-0.01em", marginBottom: "4px" }}
    >
      {children}
    </h3>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[var(--ink-muted)]"
      style={{ fontSize: "13px", lineHeight: 1.5, borderLeft: "2px solid var(--hairline)", paddingLeft: "12px" }}
    >
      {children}
    </p>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 600 }}>{children}</strong>;
}
