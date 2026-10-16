"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntakeRow } from "@/components/IntakeRow";
import { RECEIPT_SUBJECT_WORDS, gmailFilterQuery, outlookSubjectWords } from "@/lib/forwarding-filters";

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

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: "gmail", label: "Gmail", hint: "Gmail or Google Workspace" },
  { id: "outlook", label: "Outlook", hint: "Outlook.com, Hotmail or Microsoft 365" },
  { id: "other", label: "Something else", hint: "iCloud, Yahoo, Proton and others" },
];

const STEPS: Record<Provider, Step[]> = {
  gmail: [
    {
      title: "Open Gmail's forwarding settings",
      path: ["Settings (gear)", "See all settings", "Forwarding and POP/IMAP"],
      body: () => (
        <>
          <OpenLink href={GMAIL_FORWARDING_URL}>Open Gmail forwarding settings</OpenLink>
          <Hint>
            Opened the wrong Gmail account? Switch accounts at the top right of
            Gmail, or follow the path above.
          </Hint>
        </>
      ),
    },
    {
      title: "Add your UnReceipt address",
      path: ["Add a forwarding address", "Paste your address", "Next", "Proceed", "OK"],
      body: ({ forwardingEmail }) => (
        <>
          <IntakeRow callout="Your UnReceipt address" value={forwardingEmail} mono copyLabel="Copy forwarding address" quiet />
          <Hint>Gmail may ask you to sign in again. That&apos;s normal.</Hint>
        </>
      ),
    },
    {
      title: "Type in the code Gmail sent us",
      path: ["Confirmation code box", "Paste the code", "Verify"],
      kind: "code",
      body: ({ status }) => (
        <>
          <CodeBox status={status} />
          <Hint>
            Leave <Strong>Disable forwarding</Strong> selected afterwards: the
            next step forwards receipts only, not all your mail.
          </Hint>
        </>
      ),
    },
    {
      title: "Forward only receipts",
      path: ["Filters and Blocked Addresses", "Create a new filter", "Has the words: paste", "Create filter", "Forward it to: your address", "Create filter"],
      body: () => (
        <>
          <OpenLink href={GMAIL_FILTERS_URL}>Open Gmail filters</OpenLink>
          <IntakeRow
            callout="Paste into “Has the words”"
            value={gmailFilterQuery()}
            mono={false}
            copyLabel="Copy Gmail filter"
            breakWords
            quiet
          />
          <Hint>Your address not in the “Forward it to” list? Go back one step and verify the code first.</Hint>
        </>
      ),
    },
    {
      title: "Check that it works",
      path: [],
      kind: "test",
      body: (ctx) => <TestBox {...ctx} />,
    },
  ],
  outlook: [
    {
      title: "Open Outlook's rules",
      path: ["Settings (gear, top right)", "Mail", "Rules", "+ Add new rule"],
      body: () => (
        <>
          <div className="flex flex-wrap gap-2">
            <OpenLink href={OUTLOOK_PERSONAL_RULES_URL}>Outlook.com (personal)</OpenLink>
            <OpenLink href={OUTLOOK_WORK_RULES_URL}>Microsoft 365 (work)</OpenLink>
          </div>
          <Hint>The Outlook app can&apos;t make forwarding rules; use Outlook in a browser.</Hint>
        </>
      ),
    },
    {
      title: "Choose which emails",
      path: ["Name it “UnReceipt”", "Add a condition", "Subject includes"],
      body: () => (
        <>
          <p className="text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            Add these words one at a time, pressing Enter after each. Tap a word
            to copy it.
          </p>
          <WordChips words={outlookSubjectWords()} />
        </>
      ),
    },
    {
      title: "Send them to UnReceipt",
      path: ["Add an action", "Redirect to", "Paste your address", "Save"],
      body: ({ forwardingEmail }) => (
        <>
          <IntakeRow callout="Your UnReceipt address" value={forwardingEmail} mono copyLabel="Copy forwarding address" quiet />
          <Hint>
            Choose <Strong>Redirect to</Strong>, not “Forward to”: a redirect keeps
            the original sender, so we can verify the receipt. Work accounts:
            Microsoft 365 blocks forwarding outside the company by default. If you
            get a bounce email, ask your IT admin to allow it.
          </Hint>
        </>
      ),
    },
    {
      title: "Check that it works",
      path: [],
      kind: "test",
      body: (ctx) => <TestBox {...ctx} />,
    },
  ],
  other: [
    {
      title: "Find rules or filters",
      path: ["Your email on the web", "Settings", "Rules or Filters", "New rule"],
      body: () => <Hint>Most providers only offer rules in the browser version, not in the app.</Hint>,
    },
    {
      title: "Make the rule",
      path: ["When the subject contains…", "Forward or redirect to", "Your address"],
      body: ({ forwardingEmail }) => (
        <>
          <IntakeRow callout="Forward to" value={forwardingEmail} mono copyLabel="Copy forwarding address" quiet />
          <p className="text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            Subject words to match. If only one fits per rule, start with the
            ones your receipts use most:
          </p>
          <WordChips words={[...RECEIPT_SUBJECT_WORDS]} />
          <Hint>
            If your provider sends a confirmation email to the address, it shows up
            in UnReceipt under Review needed: open it and tap Original to read it.
          </Hint>
        </>
      ),
    },
    {
      title: "Check that it works",
      path: [],
      kind: "test",
      body: (ctx) => <TestBox {...ctx} />,
    },
  ],
};

type Saved = { provider: Provider | null; step: number; done: boolean };

function loadSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    if (parsed && (parsed.provider === null || (parsed.provider && parsed.provider in STEPS))) {
      return { provider: parsed.provider ?? null, step: Number(parsed.step) || 0, done: Boolean(parsed.done) };
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
          <Title titleRef={titleRef}>Where do your receipts arrive?</Title>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}>
            Pick your email and we&apos;ll walk you through it, one small step at
            a time. About 3 minutes.
          </p>
          <ul role="list" className="space-y-2">
            {PROVIDERS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  className="w-full flex items-center justify-between gap-3 text-left bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px", minHeight: "56px" }}
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
            <Title titleRef={titleRef}>You&apos;re set</Title>
          </div>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}>
            New receipts in your {PROVIDERS.find((p) => p.id === provider)?.label} inbox now
            arrive in UnReceipt by themselves. Older ones: forward them by hand.
          </p>
          <button
            type="button"
            onClick={restart}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2 transition-colors duration-100"
            style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
          >
            Set up another inbox
          </button>
        </>
      ) : current ? (
        <>
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: "10px" }}>
            <p className="text-[var(--ink-faint)]" style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {PROVIDERS.find((p) => p.id === provider)?.label} · Step {index + 1} of {total}
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
              className="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100"
              style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {index === 0 ? "Change email" : "Back"}
            </button>
            <Button
              type="button"
              className="h-11 px-5"
              onClick={() => (index === total - 1 ? setDone(true) : goTo(index + 1))}
            >
              {index === total - 1 ? "Done" : current.kind === "code" && status?.confirmation?.code ? "I've verified it" : "Next"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// "Settings (gear) › See all settings › Forwarding and POP/IMAP"
function PathTrail({ path }: { path: string[] }) {
  return (
    <ol role="list" aria-label="Where to click" className="flex flex-wrap items-center gap-1" style={{ marginTop: "8px" }}>
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
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[var(--ink)] bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      style={{ border: "1px solid var(--hairline)", borderRadius: "10px", padding: "0 14px", minHeight: "44px", fontSize: "14px", fontWeight: 600 }}
    >
      {children}
      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function CodeBox({ status }: { status: Status | null }) {
  const confirmation = status?.confirmation ?? null;
  return (
    <div role="status">
      {!confirmation ? (
        <p
          className="flex items-center gap-2 text-[var(--ink-muted)]"
          style={{ border: "1px dashed var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px" }}
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          Waiting for Gmail&apos;s email… The code appears here by itself.
        </p>
      ) : !confirmation.code ? (
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          Gmail&apos;s email arrived, but we couldn&apos;t read the code in it.
          Write to{" "}
          <a href="mailto:support@unreceipt.com" className="underline underline-offset-2 text-[var(--ink)]">
            support@unreceipt.com
          </a>{" "}
          and we&apos;ll send it to you.
        </p>
      ) : (
        <IntakeRow callout="Gmail's code" value={confirmation.code} mono={false} copyLabel="Copy Gmail confirmation code" quiet />
      )}
    </div>
  );
}

function TestBox({ status }: StepContext) {
  const [since] = useState(nowMs);
  const arrived = status?.lastEmailAt != null && Date.parse(status.lastEmailAt) >= since - 5_000;
  return (
    <>
      <p className="text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
        Ask a colleague, or use another email account, to send you an email
        with the subject <Strong>Test receipt</Strong>.
      </p>
      <div role="status">
        {arrived ? (
          <p
            className="flex items-center gap-2 text-[var(--ink)]"
            style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px", fontWeight: 600 }}
          >
            <Check className="w-4 h-4 text-[var(--primary)] shrink-0" aria-hidden="true" />
            It works: the test arrived in UnReceipt. You can delete it under
            Review needed; it doesn&apos;t count toward your plan.
          </p>
        ) : (
          <p
            className="flex items-center gap-2 text-[var(--ink-muted)]"
            style={{ border: "1px dashed var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px" }}
          >
            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
            Waiting for the test email… Nothing after 5 minutes? Check your Spam
            folder and the rule.
          </p>
        )}
      </div>
      <Hint>
        Is this inbox different from your sign-in email? Add it under{" "}
        <a href="#own-heading" className="underline underline-offset-2 text-[var(--ink)]">
          Your email addresses
        </a>{" "}
        so its receipts are verified automatically.
      </Hint>
    </>
  );
}

function WordChips({ words }: { words: readonly string[] }) {
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
      <ul role="list" aria-label="Subject words" className="flex flex-wrap gap-2">
        {words.map((w) => (
          <li key={w}>
            <button
              type="button"
              onClick={() => copy(w)}
              aria-label={`Copy “${w}”`}
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
        {copied ? `Copied ${copied}` : ""}
      </p>
    </>
  );
}

function PhoneNotice() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const send = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/forwarding/send-link", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { sentTo?: string; error?: string };
      if (!res.ok) {
        setState("error");
        setMessage(body.error ?? "Couldn't send the email. Try again in a moment.");
        return;
      }
      setState("sent");
      setMessage(`Sent to ${body.sentTo}. Open it on your computer.`);
    } catch {
      setState("error");
      setMessage("Couldn't send the email. Check your connection.");
    }
  };
  return (
    <div
      className="space-y-2"
      style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: "14px", marginBottom: "14px" }}
    >
      <p className="text-[var(--ink)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        <Strong>Best done on a computer.</Strong> Gmail and Outlook only let you
        create forwarding rules in a browser, not in their phone apps.
      </p>
      {state === "sent" ? (
        <p role="status" className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
          {message}
        </p>
      ) : (
        <Button type="button" variant="outline" className="h-11" onClick={send} disabled={state === "sending"}>
          {state === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Email me this page
        </Button>
      )}
      {state === "error" ? (
        <p
          role="alert"
          className="text-sm rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
          style={{ background: "var(--attention-tint)" }}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Dots({ total, index }: { total: number; index: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
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
