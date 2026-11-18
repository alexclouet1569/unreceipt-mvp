"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CalendarDays, CheckCircle2 } from "lucide-react";
import {
  BOOKKEEPING_OPTIONS,
  DEMO_REQUEST_LIMITS as L,
  EMPLOYEE_BANDS,
  REQUEST_KINDS,
  demoBookingUrl,
  type DemoRequestLocale,
  type RequestKind,
} from "@/lib/demo-request";
import { cn } from "@/lib/utils";
import type { DemoRequestCopy } from "./_demo-request-copy";
import { pageProps, trackEvent } from "@/lib/tracking/events";

// The contact form: a demo request or another request (`kind`), on the demo
// request pages and at the end of the home and audience pages. Posts to
// /api/demo-request (same host: the apex in production) and then shows the
// thank-you state; after a demo request, a "Choose a time" link to the
// booking page when NEXT_PUBLIC_DEMO_BOOKING_URL is set. It gets one
// language's copy as props (the server picks it), so the browser never
// downloads the other languages. The
// booking page is a link, not an embed, so the CSP stays as it is.
// Field errors from the server are written under each field (not shown by
// colour alone) and focus moves to the first one.

type Status = "idle" | "sending" | "sent";
type ErrorKind = "invalid" | "rateLimited" | "failed";
type FieldName = keyof DemoRequestCopy["form"]["fieldErrors"];

// Field order, for "focus the first wrong field".
const FIELD_ORDER: FieldName[] = [
  "name",
  "company",
  "email",
  "phone",
  "employees",
  "bookkeeping",
  "hasAccountant",
  "message",
];

// Borders and hints dark enough on white for WCAG (3:1 for borders, 4.5:1
// for text): navy at 60 % and 70 %.
const FIELD =
  "w-full rounded-xl border bg-white px-4 text-base text-[#303568] placeholder:text-[#303568]/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";
const LABEL = "block text-sm font-semibold text-[#303568] mb-1.5";
const ERROR_TEXT = "mt-1.5 text-sm font-semibold text-[#B42318]";
// A radio answer drawn as a 48 px tall box.
const CHOICE =
  "flex-1 inline-flex items-center gap-2 min-h-12 rounded-xl border bg-white px-4 text-base text-[#303568] cursor-pointer has-[:checked]:border-[#1F9D63] has-[:checked]:border-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#303568]";

export function DemoRequestForm({
  locale,
  copy,
  bookingUrl,
  idPrefix = "dr",
  headingLevel = 2,
}: {
  locale: DemoRequestLocale;
  copy: Pick<DemoRequestCopy, "form" | "sent">;
  bookingUrl: string | null;
  /** Keeps field ids unique if the form ever appears twice. */
  idPrefix?: string;
  headingLevel?: 2 | 3;
}) {
  const t = copy.form;
  const sentCopy = copy.sent;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const [kind, setKind] = useState<RequestKind>("demo");
  const isDemo = kind === "demo";
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ErrorKind | null>(null);
  const [badFields, setBadFields] = useState<Set<FieldName>>(new Set());
  const [booking, setBooking] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const sentTitle = useRef<HTMLHeadingElement>(null);

  // The thank-you state is much shorter than the form: on a phone it would
  // sit above the screen. Move focus (and the view) to its title.
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
    const accountant = text("hasAccountant");
    const payload = {
      kind,
      name: text("name"),
      company: text("company"),
      email: text("email"),
      phone: text("phone"),
      employees: text("employees"),
      bookkeeping: text("bookkeeping"),
      hasAccountant: accountant === "yes" ? true : accountant === "no" ? false : null,
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
        trackEvent("demo_request_sent", pageProps(window.location.pathname));
        setBooking(demoBookingUrl(bookingUrl, { name: payload.name, email: payload.email }));
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
    const sentDemo = kind === "demo";
    return (
      <div className="text-center py-6" role="status">
        <CheckCircle2 className="w-12 h-12 text-[#1F9D63] mx-auto mb-4" aria-hidden="true" />
        <Heading
          ref={sentTitle}
          tabIndex={-1}
          className="text-2xl font-extrabold text-[#303568] mb-2 scroll-mt-24 focus:outline-none"
        >
          {sentDemo ? sentCopy.title : sentCopy.titleQuestion}
        </Heading>
        {confirmationSent ? <p className="text-[#303568]/75 mb-6">{sentCopy.text}</p> : <div className="mb-6" />}
        {!sentDemo ? (
          <p className="text-[#303568] font-semibold">{sentCopy.questionText}</p>
        ) : booking ? (
          <>
            <p className="text-[#303568] font-semibold mb-3">{sentCopy.bookLead}</p>
            <a
              href={booking}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1A7F52] hover:bg-[#176E47] text-white font-semibold px-7 h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]"
            >
              <CalendarDays className="w-4 h-4" aria-hidden="true" />
              {sentCopy.book}
              <span className="sr-only"> ({sentCopy.newTab})</span>
            </a>
          </>
        ) : (
          <p className="text-[#303568] font-semibold">{sentCopy.noBooking}</p>
        )}
      </div>
    );
  }

  const sending = status === "sending";
  const bad = (name: FieldName) => badFields.has(name);
  const border = (name: FieldName) => (bad(name) ? "border-[#B42318] border-2" : "border-[#303568]/60");
  const errorId = (name: FieldName) => `${idPrefix}-${name}-error`;
  const id = (name: string) => `${idPrefix}-${name}`;
  // The company questions qualify a demo; for another request they are
  // optional, and the message is what's needed.
  const qualifyHint = isDemo ? undefined : t.optionalForQuestion;
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
      <Heading className="text-xl font-extrabold text-[#303568]">{t.title}</Heading>

      <fieldset>
        <legend className={LABEL}>{t.kindLegend}</legend>
        <div className="flex flex-col sm:flex-row gap-3">
          {REQUEST_KINDS.map((k) => (
            <label key={k} className={cn(CHOICE, "border-[#303568]/60")}>
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="accent-[#1F9D63] w-4 h-4"
              />
              {t.kinds[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={t.name} htmlFor={id("name")} error={fieldError("name")}>
        <input id={id("name")} name="name" required maxLength={L.name} autoComplete="name"
          className={cn(FIELD, "h-12", border("name"))} {...a11y("name")} />
      </Field>
      <Field label={t.company} htmlFor={id("company")} error={fieldError("company")}>
        <input id={id("company")} name="company" required maxLength={L.company} autoComplete="organization"
          className={cn(FIELD, "h-12", border("company"))} {...a11y("company")} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t.email} htmlFor={id("email")} error={fieldError("email")}>
          <input id={id("email")} name="email" type="email" required maxLength={L.email} autoComplete="email"
            className={cn(FIELD, "h-12", border("email"))} {...a11y("email")} />
        </Field>
        <Field label={t.phone} hint={t.optional} htmlFor={id("phone")} error={fieldError("phone")}>
          <input id={id("phone")} name="phone" type="tel" maxLength={L.phone} autoComplete="tel"
            className={cn(FIELD, "h-12", border("phone"))} {...a11y("phone")} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t.employees} hint={qualifyHint} htmlFor={id("employees")} error={fieldError("employees")}>
          <select id={id("employees")} name="employees" required={isDemo} defaultValue=""
            className={cn(FIELD, "h-12", border("employees"))} {...a11y("employees")}>
            <option value="" disabled={isDemo}>{t.choose}</option>
            {EMPLOYEE_BANDS.map((b) => (
              <option key={b} value={b}>{t.employeeOptions[b]}</option>
            ))}
          </select>
        </Field>
        <Field label={t.bookkeeping} hint={qualifyHint} htmlFor={id("bookkeeping")} error={fieldError("bookkeeping")}>
          <select id={id("bookkeeping")} name="bookkeeping" required={isDemo} defaultValue=""
            className={cn(FIELD, "h-12", border("bookkeeping"))} {...a11y("bookkeeping")}>
            <option value="" disabled={isDemo}>{t.choose}</option>
            {BOOKKEEPING_OPTIONS.map((b) => (
              <option key={b} value={b}>{t.bookkeepingOptions[b]}</option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset {...(bad("hasAccountant") ? { "aria-describedby": errorId("hasAccountant") } : {})}>
        <legend className={LABEL}>
          {t.hasAccountant}
          {qualifyHint ? <span className="font-normal text-[#303568]/70"> ({qualifyHint})</span> : null}
        </legend>
        <div className="flex gap-3">
          {(["yes", "no"] as const).map((v) => (
            <label
              key={v}
              className={cn(
                CHOICE,
                border("hasAccountant")
              )}
            >
              <input type="radio" name="hasAccountant" value={v} required={isDemo} className="accent-[#1F9D63] w-4 h-4" {...a11y("hasAccountant")} />
              {v === "yes" ? t.yes : t.no}
            </label>
          ))}
        </div>
        {fieldError("hasAccountant")}
      </fieldset>
      <Field label={t.message} hint={isDemo ? t.optional : undefined} htmlFor={id("message")} error={fieldError("message")}>
        <textarea id={id("message")} name="message" rows={4} maxLength={L.message} required={!isDemo}
          placeholder={t.messagePlaceholders[kind]}
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
  hint,
  htmlFor,
  error,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  error: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
        {hint ? <span className="font-normal text-[#303568]/70"> ({hint})</span> : null}
      </label>
      {children}
      {error}
    </div>
  );
}
