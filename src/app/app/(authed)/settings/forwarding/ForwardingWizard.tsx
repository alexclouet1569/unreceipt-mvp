"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntakeRow } from "@/components/IntakeRow";
import {
  RECEIPT_SUBJECT_WORDS,
  gmailFilterQuery,
  icloudRuleWords,
  outlookSubjectWords,
} from "@/lib/forwarding-filters";
import { ActionChecklist, ActionHint, plainText } from "./guide/ActionChecklist";
import { CHAPTERS, Q, clampPosition, type Extra, type Provider } from "./guide/actions";
import { Picture } from "./guide/Scene";
import { PROVIDER_LINKS, providerForEmail } from "@/lib/forwarding-providers";
import { GMAIL_SCENES } from "./guide/scenes/gmail";
import { GMAIL, MAIL_LANGS, say, type MailLang } from "./guide/ui-labels";

/**
 * Step-by-step forwarding setup: pick your email provider, then one chapter
 * per screen, each a checklist of single actions with a drawn picture of
 * that part of the provider's screen (guide/). Button names follow the
 * language of the user's email. Gmail's confirmation code and the test
 * email are picked up live from /api/forwarding/status.
 */

export type { Provider } from "./guide/actions";

type Status = {
  confirmation: {
    code: string | null;
    forAddress: string | null;
    receivedAt: string;
    // We confirmed the request for the user (their own Gmail asked).
    autoConfirmed?: boolean;
    // Gmail's own confirmation page (its email now has this, not a code).
    confirmUrl?: string | null;
  } | null;
  lastEmailAt: string | null;
};

const GMAIL_FORWARDING_URL = PROVIDER_LINKS.gmailForwarding;
const GMAIL_FILTERS_URL = PROVIDER_LINKS.gmailFilters;
const OUTLOOK_PERSONAL_RULES_URL = PROVIDER_LINKS.outlookPersonal;
const OUTLOOK_WORK_RULES_URL = PROVIDER_LINKS.outlookWork;
const ICLOUD_MAIL_URL = PROVIDER_LINKS.icloud;

const POLL_MS = 4_000;
const POLL_FOR_MS = 10 * 60 * 1000;
const STORAGE_KEY = "unreceipt.forwarding-wizard";

// When the test step opened; only an email after that counts as the test.
const nowMs = () => Date.now();

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: "gmail", label: "Gmail", hint: "Gmail or Google Workspace" },
  { id: "outlook", label: "Outlook", hint: "Outlook.com, Hotmail or Microsoft 365" },
  { id: "icloud", label: "iCloud Mail", hint: "@icloud.com, @me.com" },
  { id: "paid", label: "Yahoo or Proton", hint: "Automatic forwarding needs a paid plan" },
  { id: "other", label: "Something else", hint: "Any other email provider" },
];

const providerLabel = (p: Provider | null) => PROVIDERS.find((x) => x.id === p)?.label ?? "";

// `chosen`: the user picked (or went back to) the provider list themselves,
// so it isn't replaced by the one guessed from their email.
type Saved = { provider: Provider | null; step: number; action: number; done: boolean; chosen?: boolean };

function loadSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    if (parsed && (parsed.provider === null || (parsed.provider && Object.hasOwn(CHAPTERS, parsed.provider)))) {
      return {
        provider: parsed.provider ?? null,
        step: Math.max(0, Number(parsed.step) || 0),
        action: Math.max(0, Number(parsed.action) || 0),
        done: Boolean(parsed.done),
        chosen: Boolean(parsed.chosen),
      };
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  return { provider: null, step: 0, action: 0, done: false };
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

export { providerForEmail };

export function ForwardingWizard({
  forwardingEmail,
  accountEmail,
  lang = "en",
  onLangChange,
}: {
  forwardingEmail: string;
  // The sign-in email: picks the user's provider on a first visit.
  accountEmail?: string | null;
  // The language the user's email shows its buttons in.
  lang?: MailLang;
  onLangChange?: (lang: MailLang) => void;
}) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [step, setStep] = useState(0);
  const [action, setAction] = useState(0);
  const [done, setDone] = useState(false);
  const [chosen, setChosen] = useState(false);
  // Started on a provider because of the sign-in email (says so once).
  const [guessedFromEmail, setGuessedFromEmail] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const onPhone = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restored = useRef(false);

  // Pick up where the user left off (e.g. after switching to the Gmail tab
  // and back, or reloading). Deferred so server and client render alike.
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = loadSaved();
      // First visit: start on the user's own provider ("Change email" goes
      // back to the choice).
      const fresh = saved.provider === null && saved.step === 0 && !saved.done && !saved.chosen;
      const guessed = fresh ? providerForEmail(accountEmail) : null;
      const p = guessed ?? saved.provider;
      const pos = p ? clampPosition(p, saved.step, saved.action) : { step: 0, action: 0 };
      setProvider(p);
      setGuessedFromEmail(guessed != null);
      setChosen(Boolean(saved.chosen));
      setStep(pos.step);
      setAction(pos.action);
      setDone(saved.done);
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
    // Restores once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restored.current) save({ provider, step, action, done, chosen });
  }, [provider, step, action, done, chosen]);

  const chapters = provider ? CHAPTERS[provider] : [];
  const total = chapters.length;
  const index = Math.min(step, Math.max(0, total - 1));
  const chapter = provider && !done ? chapters[index] : null;
  const actionIndex = chapter ? Math.min(action, chapter.actions.length - 1) : 0;
  const autoConfirmed = Boolean(status?.confirmation?.autoConfirmed);
  const watching = (chapter?.kind === "code" && !autoConfirmed) || chapter?.kind === "test";

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

  const focusTitle = () => requestAnimationFrame(() => titleRef.current?.focus());

  const goToChapter = (next: number, toAction: "first" | "last" = "first") => {
    if (!provider) return;
    setStep(next);
    setAction(toAction === "first" ? 0 : CHAPTERS[provider][next].actions.length - 1);
    focusTitle();
  };

  const choose = (p: Provider) => {
    setChosen(true);
    setGuessedFromEmail(false);
    setProvider(p);
    setDone(false);
    setStep(0);
    setAction(0);
    focusTitle();
  };

  const restart = () => {
    setChosen(true);
    setGuessedFromEmail(false);
    setProvider(null);
    setStep(0);
    setAction(0);
    setDone(false);
    focusTitle();
  };

  const next = () => {
    if (!chapter) return;
    if (actionIndex < chapter.actions.length - 1) return setAction(actionIndex + 1);
    if (index < total - 1) return goToChapter(index + 1);
    setDone(true);
    focusTitle();
  };

  const back = () => {
    if (actionIndex > 0) return setAction(actionIndex - 1);
    if (index > 0) return goToChapter(index - 1, "last");
    restart();
  };

  const isLastAction = chapter ? actionIndex === chapter.actions.length - 1 : false;
  const nextLabel =
    index === total - 1 && isLastAction
      ? "Done"
      : chapter?.kind === "code" &&
          actionIndex === 0 &&
          (status?.confirmation?.code || status?.confirmation?.confirmUrl) &&
          !autoConfirmed
        ? "I've confirmed it"
        : "Next";

  const icloudWords = icloudRuleWords(lang);
  const renderExtra = (extra: Extra) => (
    <ExtraFor extra={extra} forwardingEmail={forwardingEmail} status={status} lang={lang} icloudWords={icloudWords} />
  );

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
            Pick your email and we&apos;ll walk you through it, one click at a
            time, with a picture of each screen. About 3 minutes.
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
            <Title titleRef={titleRef}>{provider === "paid" ? "Forward them by hand" : "You're set"}</Title>
          </div>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5, marginBottom: "12px" }}>
            {provider === "paid" ? (
              <>
                Open a receipt email, tap Forward and send it to your address.{" "}
                <a href="#hand-heading" className="underline underline-offset-2 text-[var(--ink)]">
                  See how
                </a>
                .
              </>
            ) : (
              <>
                New receipts in your {providerLabel(provider)} inbox now arrive in UnReceipt by themselves. Older ones:
                forward them by hand.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={restart}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2 transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
            style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
          >
            Set up another inbox
          </button>
        </>
      ) : chapter ? (
        <>
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: "8px" }}>
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {providerLabel(provider)} · Step {index + 1} of {total}
            </p>
            <Dots total={total} index={index} />
          </div>
          {guessedFromEmail && index === 0 && actionIndex === 0 ? (
            <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5, marginBottom: "6px" }}>
              Your sign-in email is {providerLabel(provider)}, so we started there.
              About 3 minutes, one click at a time.
            </p>
          ) : null}
          <Title titleRef={titleRef}>{chapter.title}</Title>
          {provider === "gmail" || provider === "outlook" || provider === "icloud" ? (
            <LangSwitch provider={providerLabel(provider)} lang={lang} onChange={onLangChange} />
          ) : null}
          <div style={{ marginTop: "12px" }}>
            <ActionChecklist
              actions={chapter.actions}
              current={actionIndex}
              onSelect={setAction}
              textContext={{ lang, autoConfirmed, firstWord: icloudWords[0] }}
              sceneProps={{
                lang,
                address: forwardingEmail,
                filterQuery: gmailFilterQuery(),
                words: provider === "icloud" ? icloudWords : outlookSubjectWords(),
              }}
              renderExtra={renderExtra}
            />
          </div>

          <div className="flex items-center justify-between gap-2" style={{ marginTop: "16px" }}>
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
              style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {index === 0 && actionIndex === 0 ? "Change email" : "Back"}
            </button>
            <Button type="button" className="h-11 px-5" onClick={next}>
              {nextLabel}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function LangSwitch({ provider, lang, onChange }: { provider: string; lang: MailLang; onChange?: (l: MailLang) => void }) {
  return (
    <div style={{ marginTop: "8px" }}>
      <p id="mail-lang-label" className="text-[var(--ink-muted)]" style={{ fontSize: "13px", marginBottom: "4px" }}>
        My {provider} is in
      </p>
      {/* Same segmented control as the inbox's By date / By category. */}
      <div
        role="group"
        aria-labelledby="mail-lang-label"
        className="grid grid-cols-3 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1"
      >
        {MAIL_LANGS.map((l) => {
          const active = lang === l.id;
          return (
            <button
              key={l.id}
              type="button"
              lang={l.id}
              aria-pressed={active}
              onClick={() => onChange?.(l.id)}
              className={
                active
                  ? "h-11 rounded-[6px] border border-[var(--hairline)] bg-card text-[14px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  : "h-11 rounded-[6px] border border-transparent text-[14px] font-semibold text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              }
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExtraFor({
  extra,
  forwardingEmail,
  status,
  lang,
  icloudWords,
}: {
  extra: Extra;
  forwardingEmail: string;
  status: Status | null;
  lang: MailLang;
  icloudWords: string[];
}) {
  const address = (
    <IntakeRow callout="Your UnReceipt address" value={forwardingEmail} mono copyLabel="Copy forwarding address" quiet />
  );
  switch (extra) {
    case "open-gmail-forwarding":
      return (
        <>
          <OpenLink href={GMAIL_FORWARDING_URL}>Open Gmail forwarding settings</OpenLink>
          <GmailFallback lang={lang} address={forwardingEmail} />
        </>
      );
    case "open-gmail-filters":
      return <OpenLink href={GMAIL_FILTERS_URL}>Open Gmail filters</OpenLink>;
    case "copy-address":
      return address;
    case "copy-filter":
      return (
        <IntakeRow
          callout={`Paste into “${say(GMAIL.hasTheWords, lang)}”`}
          value={gmailFilterQuery()}
          mono={false}
          copyLabel="Copy Gmail filter"
          breakWords
          quiet
        />
      );
    case "outlook-links":
      return (
        <div className="flex flex-wrap gap-2">
          <OpenLink href={OUTLOOK_PERSONAL_RULES_URL}>Outlook.com (personal)</OpenLink>
          <OpenLink href={OUTLOOK_WORK_RULES_URL}>Microsoft 365 (work)</OpenLink>
        </div>
      );
    case "outlook-words":
      return (
        <>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
            Tap a word to copy it.
          </p>
          <WordChips words={outlookSubjectWords()} />
        </>
      );
    case "icloud-open":
      return <OpenLink href={ICLOUD_MAIL_URL}>Open iCloud Mail</OpenLink>;
    case "icloud-words":
      return <WordChips words={icloudWords.slice(1)} />;
    case "other-words":
      return (
        <>
          {address}
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
            If only one word fits per rule, start with the ones your receipts use most:
          </p>
          <WordChips words={[...RECEIPT_SUBJECT_WORDS]} />
        </>
      );
    case "paid-check":
      return <PaidCheck forwardingEmail={forwardingEmail} />;
    case "code":
      return <CodeBox status={status} />;
    case "test":
      return <TestBox status={status} />;
  }
}

// When the deep link doesn't land on the right tab (another signed-in
// account, an old bookmark): the way there by hand, one picture per click.
function GmailFallback({ lang, address }: { lang: MailLang; address: string }) {
  const [open, setOpen] = useState(false);
  const sceneProps = { lang, address, filterQuery: gmailFilterQuery(), words: [] };
  const steps = [
    { scene: GMAIL_SCENES["gmail-gear"], text: <>Click <Q label={GMAIL.settings} lang={lang} /> (the gear, top right)</> },
    { scene: GMAIL_SCENES["gmail-see-all"], text: <>Click <Q label={GMAIL.seeAllSettings} lang={lang} /></> },
    { scene: GMAIL_SCENES["gmail-tab"], text: <>Click the <Q label={GMAIL.forwardingTab} lang={lang} /> tab</> },
  ];
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2 transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
        style={{ minHeight: "44px", fontSize: "13px", fontWeight: 500 }}
      >
        The button didn&apos;t open the right page?
      </button>
      {open ? (
        <ol role="list" className="space-y-3" style={{ marginTop: "4px" }}>
          {steps.map((s, i) => (
            <li key={i} className="space-y-2">
              <p className="text-[var(--ink)]" style={{ fontSize: "14px" }}>
                {i + 1}. {s.text}
              </p>
              {/* Three at once: still, so nothing glides or pulses together. */}
              <Picture label={plainText(s.text, { lang })} play={0} still>
                {s.scene(sceneProps)}
              </Picture>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

// Yahoo forwards only on Yahoo Mail Plus, and then all mail; Proton only on
// paid plans (their help pages, read 2026-11-08).
function PaidCheck({ forwardingEmail }: { forwardingEmail: string }) {
  const [which, setWhich] = useState<"yahoo" | "proton" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["yahoo", "proton"] as const).map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={which === w}
            onClick={() => setWhich(w)}
            className="text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            style={{
              border: which === w ? "1px solid var(--ink)" : "1px solid var(--hairline)",
              borderRadius: "10px",
              padding: "0 14px",
              minHeight: "44px",
              fontSize: "14px",
              fontWeight: 600,
              background: "var(--card)",
            }}
          >
            {w === "yahoo" ? "Yahoo Mail" : "Proton Mail"}
          </button>
        ))}
      </div>
      {which === "yahoo" ? (
        <ActionHint>
          Yahoo only forwards on the paid Yahoo Mail Plus, and then it forwards all your mail, not just receipts. We
          don&apos;t recommend it: every email that isn&apos;t a receipt would wait under Review needed.{" "}
          <a href="#hand-heading" className="underline underline-offset-2 text-[var(--ink)]">
            Forward receipts by hand
          </a>{" "}
          instead.
        </ActionHint>
      ) : which === "proton" ? (
        <div className="space-y-3">
          <ActionHint>
            Free Proton plans can&apos;t forward automatically:{" "}
            <a href="#hand-heading" className="underline underline-offset-2 text-[var(--ink)]">
              forward receipts by hand
            </a>
            . On a paid plan, in Proton on the web:
          </ActionHint>
          <ol role="list" className="space-y-1 text-[var(--ink)]" style={{ fontSize: "14px", lineHeight: 1.5, paddingLeft: "4px" }}>
            <li>1. Settings (gear) → <Strong>All settings</Strong></li>
            <li>2. <Strong>Forward and auto-reply</Strong> → <Strong>Add forwarding rule</Strong></li>
            <li>3. In <Strong>Forward to</Strong>, paste your address</li>
            <li>4. <Strong>Add condition</Strong>: the subject contains <Strong>receipt</Strong> (add one per word)</li>
            <li>5. <Strong>Save</Strong></li>
          </ol>
          <IntakeRow callout="Your UnReceipt address" value={forwardingEmail} mono copyLabel="Copy forwarding address" quiet />
        </div>
      ) : null}
    </div>
  );
}

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
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
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function CodeBox({ status }: { status: Status | null }) {
  const confirmation = status?.confirmation ?? null;
  const from = confirmation?.forAddress ? (
    <>
      {" "}from <Strong>{confirmation.forAddress}</Strong>
    </>
  ) : null;
  const confirmLink = confirmation?.confirmUrl ? (
    <OpenLink href={confirmation.confirmUrl}>Confirm in Gmail</OpenLink>
  ) : null;
  const codeRow = confirmation?.code ? (
    <IntakeRow callout="Gmail's code" value={confirmation.code} mono={false} copyLabel="Copy Gmail confirmation code" quiet />
  ) : null;
  return (
    <div role="status">
      {confirmation?.autoConfirmed ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            <Check className="mt-0.5 w-5 h-5 shrink-0 text-[var(--ink)]" aria-hidden="true" />
            <span>
              Done. Gmail asked us to approve forwarding{from}, and we approved it for you. Nothing to type: reload
              Gmail and your address is confirmed.
            </span>
          </p>
          {confirmLink || codeRow ? (
            <>
              <ActionHint>
                Gmail still says your UnReceipt address is unconfirmed after reloading?{" "}
                {confirmLink ? "Open Gmail's page and press Confirm there." : "Type this code in the box next to your address:"}
              </ActionHint>
              {confirmLink ?? codeRow}
            </>
          ) : null}
        </div>
      ) : !confirmation ? (
        <p
          className="flex items-center gap-2 text-[var(--ink-muted)]"
          style={{ border: "1px dashed var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px" }}
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          Waiting for Gmail&apos;s email… This updates by itself.
        </p>
      ) : confirmLink ? (
        <div className="space-y-3">
          <p className="text-[var(--ink)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            Gmail asks to forward{from} to your UnReceipt address. If that&apos;s your Gmail, open Gmail&apos;s page and
            press <Strong>Confirm</Strong>. Then reload Gmail.
          </p>
          {confirmLink}
          {codeRow ? (
            <>
              <ActionHint>Or type Gmail&apos;s code in the box next to your address:</ActionHint>
              {codeRow}
            </>
          ) : null}
        </div>
      ) : codeRow ? (
        codeRow
      ) : (
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
          Gmail&apos;s email arrived, but we couldn&apos;t read it. Write to{" "}
          <a href="mailto:support@unreceipt.com" className="underline underline-offset-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2">
            support@unreceipt.com
          </a>{" "}
          and we&apos;ll confirm it with you.
        </p>
      )}
    </div>
  );
}

function TestBox({ status }: { status: Status | null }) {
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
            <Check className="w-4 h-4 text-[var(--ink)] shrink-0" aria-hidden="true" />
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
      <ActionHint>
        Is this inbox different from your sign-in email? Add it under{" "}
        <a href="#own-heading" className="underline underline-offset-2 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2">
          Your email addresses
        </a>{" "}
        so its receipts are verified automatically.
      </ActionHint>
    </>
  );
}

export function WordChips({ words }: { words: readonly string[] }) {
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
  const [message, setMessage] = useState("");
  const send = async () => {
    setState("sending");
    setMessage("");
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
      style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: "16px", marginBottom: "16px" }}
    >
      <p className="text-[var(--ink)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        <Strong>Best done on a computer.</Strong> Gmail and Outlook only let you
        create forwarding rules in a browser, not in their phone apps.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
          {state === "sent" ? "Sent" : "Email me this page"}
        </button>
        <a
          href="#hand-heading"
          className="inline-flex items-center text-[var(--ink-muted)] hover:text-[var(--ink)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
          style={{ minHeight: "44px", fontSize: "14px", fontWeight: 500 }}
        >
          Meanwhile, forward by hand ↓
        </a>
      </div>
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

function Strong({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 600 }}>{children}</strong>;
}
