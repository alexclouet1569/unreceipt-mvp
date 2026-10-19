"use client";

import type { ReminderEmail, ReminderLocale } from "@/lib/reconcile/reminder";

type Props = {
  email: ReminderEmail;
  to: string;
  replyTo: string;
  locale: ReminderLocale;
  onLocaleChange: (locale: ReminderLocale) => void;
};

const LOCALES: { id: ReminderLocale; label: string }[] = [
  { id: "sv", label: "Svenska" },
  { id: "en", label: "English" },
];

/** The reminder exactly as the client will get it, before it's sent. */
export function ReminderPreview({ email, to, replyTo, locale, onLocaleChange }: Props) {
  return (
    <div className="bg-card" style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}>
      <div className="flex items-center justify-between gap-3" style={{ padding: "8px 8px 8px 14px" }}>
        <p className="uppercase text-[var(--ink-faint)]" style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}>
          Email to the client
        </p>
        <div
          role="group"
          aria-label="Language of the email"
          className="grid grid-cols-2 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1"
        >
          {LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={locale === l.id}
              onClick={() => onLocaleChange(l.id)}
              className={
                locale === l.id
                  ? "h-11 rounded-[6px] border border-[var(--hairline)] bg-card px-3 text-[14px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  : "h-11 rounded-[6px] border border-transparent px-3 text-[14px] font-semibold text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              }
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <dl style={{ borderTop: "1px dashed var(--hairline)", padding: "12px 14px", fontSize: "13px" }}>
        <Field label="To" value={to} />
        <Field label="Reply-To" value={replyTo} />
        <Field label="Subject" value={email.subject} strong />
      </dl>
      <pre
        className="whitespace-pre-wrap text-[var(--ink)]"
        style={{
          borderTop: "1px dashed var(--hairline)",
          padding: "12px 14px 14px",
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          lineHeight: 1.5,
        }}
      >
        {email.text}
      </pre>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-3" style={{ padding: "2px 0" }}>
      <dt className="shrink-0 text-[var(--ink-muted)]" style={{ width: "64px", fontWeight: 500 }}>
        {label}
      </dt>
      <dd
        className="min-w-0 break-words text-[var(--ink)]"
        style={{ fontWeight: strong ? 700 : 500 }}
      >
        {value}
      </dd>
    </div>
  );
}
