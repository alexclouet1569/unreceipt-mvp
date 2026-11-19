"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { CONTACT_TOPICS, DEMO_REQUEST_LIMITS as L, type DemoRequestLocale } from "@/lib/demo-request";
import { pageProps, trackEvent } from "@/lib/tracking/events";
import { cn } from "@/lib/utils";
import type { ContactCopy } from "./_contact-copy";

// The contact page's form: name, email, reason, message. Posts to
// /api/demo-request as kind `contact` (same host: the apex in production),
// which stores it, emails the founder (Reply-To the visitor) and sends the
// visitor a fixed confirmation. Gets one language's copy as props. Field
// errors from the server are written under each field (not shown by colour
// alone) and focus moves to the first one. Same look as the demo form.

type Status = "idle" | "sending" | "sent";
type ErrorKind = "invalid" | "rateLimited" | "failed";
type FieldName = keyof ContactCopy["form"]["fieldErrors"];

const FIELD_ORDER: FieldName[] = ["name", "email", "topic", "message"];

// Borders and hints dark enough on white for WCAG (3:1 for borders, 4.5:1
// for text): navy at 60 % and 70 %.
const FIELD =
  "w-full rounded-xl border bg-white px-4 text-base text-[#303568] placeholder:text-[#303568]/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";
const LABEL = "block text-sm font-semibold text-[#303568] mb-1.5";
const ERROR_TEXT = "mt-1.5 text-sm font-semibold text-[#B42318]";

export function ContactForm({ locale, copy }: { locale: DemoRequestLocale; copy: ContactCopy["form"] & { sent: ContactCopy["sent"] } }) {
  const t = copy;
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ErrorKind | null>(null);
  const [badFields, setBadFields] = useState<Set<FieldName>>(new Set());
  const [confirmationSent, setConfirmationSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const sentTitle = useRef<HTMLHeadingElement>(null);

  // The thank-you state is shorter than the form: move focus (and the view)
  // to its title.
  useEffect(() => {
    if (status === "sent") sentTitle.current?.focus();
  }, [status]);

  // After a refusal, take the person to the first field to fix.
  useEffect(() => {
    const first = FIELD_ORDER.find((f) => badFields.has(f));
    if (!first) return;
    formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }, [badFields]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const data = new FormData(e.currentTarget);
    const text = (k: string) => String(data.get(k) ?? "");
    const payload = {
      kind: "contact",
      name: text("name"),
      email: text("email"),
      topic: text("topic"),
      message: text("message"),
      website: text("website"),
      locale,
    };
    setStatus("sending");
    setError(null);
    setBadFields(new Set());
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { confirmation?: boolean } | null;
        setConfirmationSent(json?.confirmation === true);
        trackEvent("contact_sent", pageProps(window.location.pathname));
        setStatus("sent");
        return;
      }
      if (res.status === 400) {
        const json = (await res.json().catch(() => null)) as { fields?: string[] } | null;
        const fields = (json?.fields ?? []).filter((f): f is FieldName =>
          (FIELD_ORDER as string[]).includes(f)
        );
        setBadFields(new Set(fields));
        setError(fields.length > 0 ? "invalid" : "failed");
      } else {
        setError(res.status === 429 ? "rateLimited" : "failed");
      }
    } catch {
      setError("failed");
    }
    setStatus("idle");
  }

  if (status === "sent") {
    return (
      <div className="text-center py-6" role="status">
        <CheckCircle2 className="w-12 h-12 text-[#1F9D63] mx-auto mb-4" aria-hidden="true" />
        <h2
          ref={sentTitle}
          tabIndex={-1}
          className="text-2xl font-extrabold text-[#303568] mb-2 scroll-mt-24 focus:outline-none"
        >
          {t.sent.title}
        </h2>
        <p className="text-[#303568] font-semibold mb-2">{t.sent.reply}</p>
        {confirmationSent ? <p className="text-[#303568]/75 mb-6">{t.sent.confirmation}</p> : <div className="mb-6" />}
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-sm font-semibold text-[#303568] underline underline-offset-2 hover:text-[#1A7F52] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]"
        >
          {t.sent.another}
        </button>
      </div>
    );
  }

  const sending = status === "sending";
  const bad = (name: FieldName) => badFields.has(name);
  const border = (name: FieldName) => (bad(name) ? "border-[#B42318] border-2" : "border-[#303568]/60");
  const errorId = (name: FieldName) => `contact-${name}-error`;
  const id = (name: string) => `contact-${name}`;
  const a11y = (name: FieldName) =>
    bad(name) ? { "aria-invalid": true as const, "aria-describedby": errorId(name) } : {};
  const fieldError = (name: FieldName) =>
    bad(name) ? (
      <p id={errorId(name)} className={ERROR_TEXT}>
        {t.fieldErrors[name]}
      </p>
    ) : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="relative space-y-4">
      <h2 className="text-xl font-extrabold text-[#303568]">{t.title}</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t.name} htmlFor={id("name")} error={fieldError("name")}>
          <input id={id("name")} name="name" required maxLength={L.name} autoComplete="name"
            className={cn(FIELD, "h-12", border("name"))} {...a11y("name")} />
        </Field>
        <Field label={t.email} htmlFor={id("email")} error={fieldError("email")}>
          <input id={id("email")} name="email" type="email" required maxLength={L.email} autoComplete="email"
            className={cn(FIELD, "h-12", border("email"))} {...a11y("email")} />
        </Field>
      </div>
      <Field label={t.topic} htmlFor={id("topic")} error={fieldError("topic")}>
        <select id={id("topic")} name="topic" required defaultValue=""
          className={cn(FIELD, "h-12", border("topic"))} {...a11y("topic")}>
          <option value="" disabled>{t.choose}</option>
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic} value={topic}>{t.topics[topic]}</option>
          ))}
        </select>
      </Field>
      <Field label={t.message} htmlFor={id("message")} error={fieldError("message")}>
        <textarea id={id("message")} name="message" rows={6} maxLength={L.message} required
          placeholder={t.messagePlaceholder}
          className={cn(FIELD, "py-3 resize-y", border("message"))} {...a11y("message")} />
      </Field>

      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[10000px] w-px h-px overflow-hidden">
        <label htmlFor={id("website")}>Website</label>
        <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div aria-live="polite">
        {error ? <p className="text-sm font-semibold text-[#B42318]">{t.errors[error]}</p> : null}
      </div>

      {/* aria-disabled, not disabled: a disabled button drops keyboard focus. */}
      <button
        type="submit"
        aria-disabled={sending}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#1A7F52] hover:bg-[#176E47] text-white text-base font-semibold h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]",
          sending && "opacity-60 cursor-wait"
        )}
      >
        {sending ? t.sending : t.submit}
        {sending ? null : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
      </button>
      <p className="text-xs text-[#303568]/70">
        {t.privacy}{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-[#303568]">
          {t.privacyLink}
        </a>
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
      {error}
    </div>
  );
}
