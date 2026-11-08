"use client";

import { useEffect, useState } from "react";
import { IntakeRow } from "@/components/IntakeRow";
import { ActionChecklist, ActionHint } from "./ActionChecklist";
import { Q, type GuideAction } from "./actions";
import { phoneScenes, type PhoneApp } from "./scenes/phone";
import { PHONE, type MailLang } from "./ui-labels";

/**
 * Forwarding a receipt by hand from a phone mail app, one tap at a time
 * with a picture of each screen. Works everywhere, including providers that
 * can't forward automatically.
 */

const APPS: { id: PhoneApp; label: string }[] = [
  { id: "iphone", label: "iPhone Mail" },
  { id: "gmail", label: "Gmail app" },
  { id: "outlook", label: "Outlook app" },
];

function actionsFor(app: PhoneApp): GuideAction[] {
  const scenes = phoneScenes(app);
  return [
    { id: "hand-open", scene: scenes.open, text: () => "Open the receipt email" },
    {
      id: "hand-menu",
      scene: scenes.menu,
      text: () =>
        app === "iphone"
          ? "Tap the arrow at the bottom"
          : app === "gmail"
            ? "Tap ⋮ at the top right of the email"
            : "Tap ⋯ at the top right of the email",
    },
    {
      id: "hand-forward",
      scene: scenes.forward,
      text: ({ lang }) => (
        <>
          Tap <Q label={PHONE.forward} lang={lang} />
        </>
      ),
    },
    {
      id: "hand-to",
      scene: scenes.to,
      text: ({ lang }) => (
        <>
          In <Q label={PHONE.to} lang={lang} />, type <strong style={{ fontWeight: 600 }}>UnReceipt</strong>
        </>
      ),
      extra: "copy-address",
      hint: () =>
        "The first time, paste your address and save it as a contact called “UnReceipt”. After that, typing “Unr” is enough.",
    },
    { id: "hand-send", scene: scenes.send, text: () => "Tap Send. The receipt waits under Review needed for a quick check." },
  ];
}

export function HandForward({ forwardingEmail, lang }: { forwardingEmail: string; lang: MailLang }) {
  const [app, setApp] = useState<PhoneApp>("gmail");
  const [current, setCurrent] = useState(0);

  // Start on iPhone Mail on an iPhone or iPad. Deferred so server and
  // client render alike.
  useEffect(() => {
    const t = setTimeout(() => {
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setApp("iphone");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const actions = actionsFor(app);
  const last = current >= actions.length - 1;

  return (
    <div className="bg-card space-y-3" style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        Works from any email app, for receipts you already have and for
        providers that can&apos;t forward by themselves.
      </p>
      <div role="group" aria-label="Your phone's mail app" className="flex flex-wrap gap-2">
        {APPS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={app === a.id}
            onClick={() => {
              setApp(a.id);
              setCurrent(0);
            }}
            className="text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            style={{
              border: app === a.id ? "1px solid var(--ink)" : "1px solid var(--hairline)",
              background: app === a.id ? "var(--surface)" : "var(--card)",
              borderRadius: "10px",
              padding: "0 12px",
              minHeight: "44px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <ActionChecklist
        actions={actions}
        current={current}
        onSelect={setCurrent}
        pointer="finger"
        textContext={{ lang, autoConfirmed: false, firstWord: "" }}
        sceneProps={{ lang, address: forwardingEmail, filterQuery: "", words: [] }}
        renderExtra={() => (
          <IntakeRow callout="Your UnReceipt address" value={forwardingEmail} mono copyLabel="Copy forwarding address" quiet />
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <ActionHint>Your phone&apos;s mail app shows these words in your phone&apos;s language.</ActionHint>
        <button
          type="button"
          onClick={() => setCurrent(last ? 0 : current + 1)}
          className="shrink-0 text-[var(--ink)] bg-card hover:bg-[var(--surface)] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
          style={{ border: "1px solid var(--hairline)", borderRadius: "10px", padding: "0 14px", minHeight: "44px", fontSize: "14px", fontWeight: 600 }}
        >
          {last ? "Start over" : "Next tap"}
        </button>
      </div>
    </div>
  );
}
