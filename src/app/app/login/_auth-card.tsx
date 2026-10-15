"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { getSupabaseClient } from "@/lib/supabase-client";
import { cn } from "@/lib/utils";
import {
  CODE_LENGTH,
  callAuth,
  callbackUrl,
  emailSchema,
  finishSignIn,
  isRateLimited,
  isUnreachable,
  shake,
  signInSchema,
  signUpSchema,
  UNREACHABLE,
  type AuthMode,
} from "./_auth-lib";
import {
  EmailInput,
  ENTER,
  Field,
  FOCUS_RING,
  Notice,
  PasswordInput,
  Step,
  SubmitButton,
  TextInput,
  TextLink,
  type SubmitState,
} from "./_auth-ui";
import { CodeStep } from "./_code-step";

export type { AuthMode } from "./_auth-lib";

type AuthCardProps = {
  initialMode: AuthMode;
  pilot: boolean;
  /** Banner for a failed email link (from ?error=…). */
  linkError: boolean;
  /** Neutral notice, e.g. after account deletion or a re-auth bounce. */
  notice: string | null;
};

type PendingCode = { email: string; purpose: "signup" | "signin" };
type EntryFocus = "first" | "email" | null;
type SignUpDetails = { fullName: string; companyName: string; password: string };

export function AuthCard({ initialMode, pilot, linkError, notice }: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showLinkError, setShowLinkError] = useState(linkError);
  // Where focus goes when a form appears: its first field on page load, the
  // email after coming back from the code step, nowhere after a tab switch
  // (focus stays on the tab the person just used).
  const [entryFocus, setEntryFocus] = useState<EntryFocus>("first");
  // Lifted so switching tabs or going back from the code step keeps what
  // the person already typed.
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState<SignUpDetails>({ fullName: "", companyName: "", password: "" });
  const [pendingCode, setPendingCode] = useState<PendingCode | null>(null);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setEntryFocus(null);
    setShowLinkError(false);
    // Keep the URL shareable and the back button honest.
    const url = new URL(window.location.href);
    if (next === "signup") url.searchParams.set("mode", "signup");
    else url.searchParams.delete("mode");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
  };

  const heading =
    mode === "signin"
      ? { title: "Welcome back", sub: "Sign in to see your receipts." }
      : {
          title: pilot ? "Join the pilot" : "Create your account",
          sub: pilot
            ? "Free during the pilot. No card needed."
            : "One private receipt address for your whole company.",
        };

  const resendFor = (p: PendingCode) => () =>
    p.purpose === "signup"
      ? callAuth("resend", () =>
          getSupabaseClient().auth.resend({
            type: "signup",
            email: p.email,
            options: { emailRedirectTo: callbackUrl() },
          })
        )
      : callAuth("signInWithOtp", () =>
          getSupabaseClient().auth.signInWithOtp({
            email: p.email,
            options: { emailRedirectTo: callbackUrl() },
          })
        );

  return (
    <main className="min-h-dvh bg-[var(--surface)] flex flex-col items-center px-4 pt-10 pb-8 sm:pt-16">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <Wordmark variant="stacked" style={{ fontSize: "20px" }} />
        </div>

        {showLinkError ? (
          <Notice tone="attention" className="mb-4">
            That link didn&apos;t work — links work once and expire after an
            hour. If you just confirmed your email, sign in below.
          </Notice>
        ) : notice ? (
          <Notice tone="neutral" className="mb-4">
            {notice}
          </Notice>
        ) : null}

        <section
          aria-labelledby="auth-title"
          className="bg-card border border-[var(--hairline)] rounded-[16px] px-5 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7"
        >
          {pendingCode ? (
            <Step stepKey={`code-${pendingCode.email}`}>
              <CodeStep
                email={pendingCode.email}
                purpose={pendingCode.purpose}
                resend={resendFor(pendingCode)}
                onChangeEmail={() => {
                  setPendingCode(null);
                  setEntryFocus("email");
                }}
                onSignInInstead={() => {
                  setPendingCode(null);
                  switchMode("signin");
                  setEntryFocus("email");
                }}
              />
            </Step>
          ) : (
            <>
              <h1
                id="auth-title"
                className="font-display text-[24px] leading-[1.15] tracking-[-0.02em] font-bold text-[var(--ink)]"
              >
                {heading.title}
              </h1>
              <p className="font-accent italic text-[15px] text-[var(--ink-muted)] mt-1">
                {heading.sub}
              </p>

              <ModeSwitch mode={mode} onChange={switchMode} />

              <div role="tabpanel" id="auth-panel" aria-labelledby={`auth-tab-${mode}`}>
                {mode === "signin" ? (
                  <SignInPanel
                    key="signin"
                    email={email}
                    setEmail={setEmail}
                    entryFocus={entryFocus}
                    onCodeSent={(e) => setPendingCode({ email: e, purpose: "signin" })}
                  />
                ) : (
                  <SignUpPanel
                    key="signup"
                    email={email}
                    setEmail={setEmail}
                    details={details}
                    setDetails={setDetails}
                    entryFocus={entryFocus}
                    onCodeSent={(e) => setPendingCode({ email: e, purpose: "signup" })}
                    onSignIn={() => switchMode("signin")}
                  />
                )}
              </div>
            </>
          )}
        </section>

        <p className="flex items-center justify-center gap-2 text-[13px] text-[var(--ink-muted)] mt-6">
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          Encrypted, and stored in the EU.
        </p>

        <div className="flex flex-col items-center mt-3">
          <ResetSessionLink />
          <Link
            href="/"
            className={cn(
              "text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] inline-flex items-center gap-1 min-h-[44px] px-2 rounded-[6px]",
              FOCUS_RING
            )}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to unreceipt.com
          </Link>
        </div>
      </div>
    </main>
  );
}

// ─── Mode switch (WAI-ARIA tabs, sliding indicator) ─────────────────────────

function ModeSwitch({ mode, onChange }: { mode: AuthMode; onChange: (m: AuthMode) => void }) {
  const tabs: { id: AuthMode; label: string }[] = [
    { id: "signin", label: "Sign in" },
    { id: "signup", label: "Create account" },
  ];
  const refs = useRef<Record<AuthMode, HTMLButtonElement | null>>({ signin: null, signup: null });

  // Arrows / Home / End move between the two tabs and activate them; only
  // the active tab is in the Tab order.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, AuthMode | "toggle"> = {
      ArrowLeft: "toggle",
      ArrowRight: "toggle",
      Home: "signin",
      End: "signup",
    };
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    const next = k === "toggle" ? (mode === "signin" ? "signup" : "signin") : k;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Sign in or create an account"
      onKeyDown={onKeyDown}
      className="relative grid grid-cols-2 p-1 mt-6 mb-6 rounded-[10px] bg-[var(--surface)] border border-[var(--hairline)]"
    >
      {/* The white pill slides under the active tab. */}
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-[6px] bg-card border border-[var(--hairline)] transition-transform duration-[320ms]"
        style={{
          transform: mode === "signup" ? "translateX(100%)" : "translateX(0)",
          transitionTimingFunction: ENTER,
        }}
      />
      {tabs.map((t) => {
        const active = mode === t.id;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`auth-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="auth-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative z-10 h-11 rounded-[6px] text-[15px] font-semibold transition-colors duration-100",
              FOCUS_RING,
              active ? "text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Form error state ───────────────────────────────────────────────────────

// Field errors sit under their input; anything else (wrong password,
// network) is one notice above the button. Either way the form shakes and
// focus moves to where the fix is.
function useFormErrors(ids: string, formRef: React.RefObject<HTMLFormElement | null>) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  return {
    formError,
    fieldError: (field: string) => fieldErrors[field] ?? null,
    describe: (field: string) =>
      fieldErrors[field]
        ? { "aria-invalid": true as const, "aria-describedby": `${ids}-${field}-error` }
        : {},
    clear: () => {
      setFieldErrors({});
      setFormError("");
    },
    clearField: (field: string) =>
      setFieldErrors((f) => {
        if (!(field in f)) return f;
        const next = { ...f };
        delete next[field];
        return next;
      }),
    failField: (field: string, message: string) => {
      setFieldErrors({ [field]: message });
      setFormError("");
      shake(formRef.current);
      // Wait for the error to render so aria-describedby resolves.
      requestAnimationFrame(() => document.getElementById(`${ids}-${field}`)?.focus());
    },
    failForm: (message: string, focusField?: string) => {
      setFieldErrors({});
      setFormError(message);
      shake(formRef.current);
      // The submit button was disabled while loading and lost focus; put
      // the person back where they can retry.
      if (focusField)
        requestAnimationFrame(() => document.getElementById(`${ids}-${focusField}`)?.focus());
    },
  };
}

// ─── Sign in ────────────────────────────────────────────────────────────────

function SignInPanel({
  email,
  setEmail,
  entryFocus,
  onCodeSent,
}: {
  email: string;
  setEmail: (v: string) => void;
  entryFocus: EntryFocus;
  onCodeSent: (email: string) => void;
}) {
  const ids = useId();
  const [view, setView] = useState<"password" | "code">("password");
  // The password form autofocuses its email on entry and when coming back
  // from the code form.
  const [focusEmail, setFocusEmail] = useState(entryFocus !== null);
  const [password, setPassword] = useState("");
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const errors = useFormErrors(ids, formRef);

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    errors.clear();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.failField(String(issue?.path[0] ?? "email"), issue?.message ?? "Check your details");
      return;
    }

    setSubmit("loading");
    const { error } = await callAuth("signInWithPassword", () =>
      getSupabaseClient().auth.signInWithPassword(parsed.data)
    );
    if (error) {
      setSubmit("idle");
      if (isUnreachable(error)) errors.failForm(UNREACHABLE, "password");
      else if (error.code === "email_not_confirmed")
        errors.failForm("Confirm your email first — use the code or link we sent you.", "email");
      else if (isRateLimited(error))
        errors.failForm("Too many attempts. Wait a minute, then try again.", "password");
      else
        errors.failForm("Email or password is wrong. Try again, or sign in with an email code.", "password");
      return;
    }

    setSubmit("done");
    // Full navigation so the server gate at /app reads the new cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a hard load is the point
    window.location.assign("/app");
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    errors.clear();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      errors.failField("code-email", parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }

    setSubmit("loading");
    const { error } = await callAuth("signInWithOtp", () =>
      getSupabaseClient().auth.signInWithOtp({
        email: parsed.data,
        options: { emailRedirectTo: callbackUrl() },
      })
    );
    setSubmit("idle");
    if (error) {
      errors.failForm(
        isUnreachable(error)
          ? UNREACHABLE
          : isRateLimited(error)
            ? "We just sent you a code. Wait a minute before asking for another."
            : "We couldn't send the code. Check the address and try again.",
        "code-email"
      );
      return;
    }
    onCodeSent(parsed.data);
  };

  if (view === "code") {
    return (
      <Step stepKey="signin-code">
        <form ref={formRef} onSubmit={handleCode} className="space-y-5" noValidate>
          <p className="text-[15px] leading-[1.5] text-[var(--ink-muted)]">
            We&apos;ll email you a {CODE_LENGTH}-digit code. No password needed.
          </p>
          <Field
            label="Email address"
            htmlFor={`${ids}-code-email`}
            error={errors.fieldError("code-email")}
            errorId={`${ids}-code-email-error`}
          >
            <EmailInput
              id={`${ids}-code-email`}
              placeholder="you@company.com"
              value={email}
              onValueChange={(v) => {
                setEmail(v);
                errors.clearField("code-email");
              }}
              required
              autoFocus
              {...errors.describe("code-email")}
            />
          </Field>
          {errors.formError ? <Notice tone="attention">{errors.formError}</Notice> : null}
          <SubmitButton state={submit} loadingLabel="Sending…" doneLabel="Sent">
            Email me a code
          </SubmitButton>
          <div className="flex justify-center -mt-1">
            <TextLink
              onClick={() => {
                setView("password");
                setFocusEmail(true);
                errors.clear();
              }}
            >
              Use my password instead
            </TextLink>
          </div>
        </form>
      </Step>
    );
  }

  return (
    <Step stepKey="signin-password">
      <form ref={formRef} onSubmit={handlePassword} className="space-y-5" noValidate>
        <Field
          label="Email address"
          htmlFor={`${ids}-email`}
          error={errors.fieldError("email")}
          errorId={`${ids}-email-error`}
        >
          <EmailInput
            id={`${ids}-email`}
            placeholder="you@company.com"
            value={email}
            onValueChange={(v) => {
              setEmail(v);
              errors.clearField("email");
            }}
            required
            autoFocus={focusEmail}
            {...errors.describe("email")}
          />
        </Field>
        <Field
          label="Password"
          htmlFor={`${ids}-password`}
          error={errors.fieldError("password")}
          errorId={`${ids}-password-error`}
        >
          <PasswordInput
            id={`${ids}-password`}
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              errors.clearField("password");
            }}
            required
            {...errors.describe("password")}
          />
        </Field>
        {errors.formError ? <Notice tone="attention">{errors.formError}</Notice> : null}
        <SubmitButton state={submit} loadingLabel="Signing in…" doneLabel="Signed in">
          Sign in
        </SubmitButton>
        <div className="flex justify-center -mt-1">
          <TextLink
            onClick={() => {
              setView("code");
              errors.clear();
            }}
          >
            Forgot password? Sign in with an email code
          </TextLink>
        </div>
      </form>
    </Step>
  );
}

// ─── Create account ─────────────────────────────────────────────────────────

// Zod path → input id suffix.
const SIGNUP_FIELD: Record<string, string> = {
  full_name: "name",
  company_name: "company",
  email: "email",
  password: "password",
};

function SignUpPanel({
  email,
  setEmail,
  details,
  setDetails,
  entryFocus,
  onCodeSent,
  onSignIn,
}: {
  email: string;
  setEmail: (v: string) => void;
  details: SignUpDetails;
  setDetails: React.Dispatch<React.SetStateAction<SignUpDetails>>;
  entryFocus: EntryFocus;
  onCodeSent: (email: string) => void;
  onSignIn: () => void;
}) {
  const ids = useId();
  const { fullName, companyName, password } = details;
  const setField = (key: keyof SignUpDetails) => (value: string) =>
    setDetails((d) => ({ ...d, [key]: value }));
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const errors = useFormErrors(ids, formRef);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    errors.clear();
    setAlreadyRegistered(false);
    const parsed = signUpSchema.safeParse({
      full_name: fullName,
      company_name: companyName,
      email,
      password,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.failField(
        SIGNUP_FIELD[String(issue?.path[0])] ?? "email",
        issue?.message ?? "Check your details"
      );
      return;
    }

    setSubmit("loading");
    let hasSession = false;
    const { error } = await callAuth("signUp", async () => {
      const res = await getSupabaseClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          // The email's link lands on /auth/callback, which sets the session
          // cookie server-side and upserts public.profiles from this metadata.
          emailRedirectTo: callbackUrl(),
          data: {
            full_name: parsed.data.full_name,
            company_name: parsed.data.company_name || null,
          },
        },
      });
      hasSession = Boolean(res.data?.session);
      return res;
    });

    if (error) {
      setSubmit("idle");
      const msg = (error.message ?? "").toLowerCase();
      if (isUnreachable(error)) errors.failForm(UNREACHABLE, "email");
      else if (msg.includes("already") || msg.includes("registered")) setAlreadyRegistered(true);
      else if (isRateLimited(error))
        errors.failForm("Too many sign-ups from here just now. Wait a minute, then try again.", "email");
      else if (msg.includes("password"))
        errors.failField("password", "Choose a stronger password — at least 8 characters.");
      else errors.failForm("We couldn't create your account. Try again in a moment.", "email");
      return;
    }

    // Projects with email confirmation off sign the person in right away.
    if (hasSession) {
      setSubmit("done");
      await finishSignIn();
      return;
    }
    setSubmit("idle");
    onCodeSent(parsed.data.email);
  };

  return (
    <Step stepKey="signup">
      <form ref={formRef} onSubmit={handleSignUp} className="space-y-5" noValidate>
        <Field
          label="Full name"
          htmlFor={`${ids}-name`}
          error={errors.fieldError("name")}
          errorId={`${ids}-name-error`}
        >
          <TextInput
            id={`${ids}-name`}
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Alex Andersson"
            value={fullName}
            onChange={(e) => {
              setField("fullName")(e.target.value);
              errors.clearField("name");
            }}
            required
            autoFocus={entryFocus === "first"}
            {...errors.describe("name")}
          />
        </Field>
        <Field
          label="Company"
          hint="Optional"
          htmlFor={`${ids}-company`}
          error={errors.fieldError("company")}
          errorId={`${ids}-company-error`}
        >
          <TextInput
            id={`${ids}-company`}
            type="text"
            autoComplete="organization"
            placeholder="Acme AB"
            value={companyName}
            onChange={(e) => {
              setField("companyName")(e.target.value);
              errors.clearField("company");
            }}
            {...errors.describe("company")}
          />
        </Field>
        <Field
          label="Work email"
          htmlFor={`${ids}-email`}
          error={errors.fieldError("email")}
          errorId={`${ids}-email-error`}
        >
          <EmailInput
            id={`${ids}-email`}
            placeholder="you@company.com"
            value={email}
            onValueChange={(v) => {
              setEmail(v);
              errors.clearField("email");
            }}
            required
            autoFocus={entryFocus === "email"}
            {...errors.describe("email")}
          />
        </Field>
        <Field
          label="Password"
          htmlFor={`${ids}-password`}
          error={errors.fieldError("password")}
          errorId={`${ids}-password-error`}
        >
          <PasswordInput
            id={`${ids}-password`}
            autoComplete="new-password"
            showRule
            value={password}
            onChange={(e) => {
              setField("password")(e.target.value);
              errors.clearField("password");
            }}
            required
            {...errors.describe("password")}
          />
        </Field>
        {alreadyRegistered ? (
          <div>
            <Notice tone="attention">That email already has an account.</Notice>
            <div className="flex justify-center">
              <TextLink onClick={onSignIn}>Sign in instead</TextLink>
            </div>
          </div>
        ) : errors.formError ? (
          <Notice tone="attention">{errors.formError}</Notice>
        ) : null}
        <SubmitButton state={submit} loadingLabel="Creating your account…" doneLabel="Account created">
          Create account
        </SubmitButton>
        <p className="text-[13px] leading-[1.5] text-[var(--ink-muted)] text-center">
          We&apos;ll email you a code to confirm it&apos;s you. How we handle
          your data:{" "}
          <a
            href="/privacy"
            className={cn("underline underline-offset-2 hover:text-[var(--ink)] rounded-[4px]", FOCUS_RING)}
          >
            privacy notice
          </a>
          .
        </p>
      </form>
    </Step>
  );
}

// Escape hatch for users with stale supabase-js cookies (deleted user,
// rotated JWT secret). Quiet on purpose — the people who need it are already
// looking for a way out.
function ResetSessionLink() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/clear", { method: "POST" }).catch(() => {});
        window.location.reload();
      }}
      disabled={busy}
      className={cn(
        "text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50 min-h-[44px] px-2 rounded-[6px]",
        FOCUS_RING
      )}
    >
      {busy ? "Resetting…" : "Trouble signing in? Reset your session"}
    </button>
  );
}
