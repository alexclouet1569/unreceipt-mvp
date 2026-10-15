"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import {
  ArrowLeft,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  ShieldCheck,
} from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { getSupabaseClient } from "@/lib/supabase-client";
import { withTimeout } from "@/lib/with-timeout";
import { cn } from "@/lib/utils";

export type AuthMode = "signin" | "signup";

type AuthCardProps = {
  initialMode: AuthMode;
  pilot: boolean;
  /** Banner for a failed magic / confirmation link (from ?error=…). */
  linkError: boolean;
  /** Neutral notice, e.g. after account deletion or a re-auth bounce. */
  notice: string | null;
};

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");

const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100),
  company_name: z.string().trim().max(100).optional().or(z.literal("")),
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
});

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

// Safety net, not the normal path: supabase-js calls answer in well under a
// second. If one doesn't, say so instead of spinning forever.
const AUTH_TIMEOUT_MS = 12_000;
const RESEND_COOLDOWN_MS = 60_000;
const UNREACHABLE =
  "We couldn't reach the sign-in service. Check your connection and try again.";

type AuthResult = { error: { message?: string; code?: string } | null };

async function callAuth(
  label: string,
  run: () => PromiseLike<AuthResult>
): Promise<AuthResult> {
  try {
    return await withTimeout(label, AUTH_TIMEOUT_MS, run());
  } catch (e) {
    return {
      error: { message: e instanceof Error ? e.message : "request failed", code: "unreachable" },
    };
  }
}

function isUnreachable(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "unreachable" ||
    msg.includes("timed out") ||
    msg.includes("failed to fetch") ||
    msg.includes("network")
  );
}

function callbackUrl(): string {
  return `${window.location.origin}/auth/callback?next=/app`;
}

export function AuthCard({ initialMode, pilot, linkError, notice }: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showLinkError, setShowLinkError] = useState(linkError);
  // Autofocus the first field on page load only; after a tab switch focus
  // stays on the tab the person just used.
  const [switched, setSwitched] = useState(false);
  // Shared so switching tabs keeps what the person already typed.
  const [email, setEmail] = useState("");

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setSwitched(true);
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

  return (
    <main className="min-h-dvh bg-[var(--surface)] flex flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <Wordmark variant="stacked" style={{ fontSize: "20px" }} />
        </div>

        {showLinkError ? (
          <Notice tone="attention" className="mb-4">
            That link didn&apos;t work. Links work once and expire after an
            hour — sign in below or ask for a new one.
          </Notice>
        ) : notice ? (
          <Notice tone="neutral" className="mb-4">
            {notice}
          </Notice>
        ) : null}

        <section
          aria-labelledby="auth-title"
          className="bg-card border border-[var(--hairline)] rounded-[16px] overflow-hidden"
        >
          <div className="px-5 pt-6 pb-8 sm:px-8 sm:pt-8">
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

            <div
              role="tabpanel"
              id="auth-panel"
              aria-labelledby={`auth-tab-${mode}`}
            >
              {mode === "signin" ? (
                <SignInPanel email={email} setEmail={setEmail} autoFocus={!switched} />
              ) : (
                <SignUpPanel
                  email={email}
                  setEmail={setEmail}
                  autoFocus={!switched}
                  onSignIn={() => switchMode("signin")}
                />
              )}
            </div>
          </div>
        </section>

        <p className="flex items-center justify-center gap-2 text-[13px] text-[var(--ink-muted)] mt-6">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          Your receipts are stored in the EU.
        </p>

        <div className="flex flex-col items-center gap-1 mt-4">
          <ResetSessionLink />
          <Link
            href="/"
            className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] inline-flex items-center gap-1 min-h-[44px] px-2 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to unreceipt.com
          </Link>
        </div>
      </div>
    </main>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: AuthMode;
  onChange: (m: AuthMode) => void;
}) {
  const tabs: { id: AuthMode; label: string }[] = [
    { id: "signin", label: "Sign in" },
    { id: "signup", label: "Create account" },
  ];
  const refs = useRef<Record<AuthMode, HTMLButtonElement | null>>({
    signin: null,
    signup: null,
  });

  // WAI-ARIA tabs: arrows / Home / End move between the two tabs and
  // activate them; only the active tab is in the Tab order.
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
      className="grid grid-cols-2 gap-1 p-1 mt-6 mb-6 rounded-[10px] bg-[var(--surface)] border border-[var(--hairline)]"
    >
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
              "h-11 rounded-[6px] text-[15px] font-semibold transition-colors duration-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active
                ? "bg-card text-[var(--ink)] border border-[var(--hairline)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)] border border-transparent"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Form primitives ────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between text-[13px] font-semibold text-[var(--ink)] mb-2"
      >
        <span>{label}</span>
        {hint ? (
          <span className="font-medium text-[var(--ink-muted)]">{hint}</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full h-11 rounded-[6px] border border-[var(--hairline)] bg-card px-3 text-[16px] sm:text-[15px] text-[var(--ink)] " +
  "placeholder:text-[var(--ink-faint)] outline-none transition-colors duration-100 " +
  "focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 " +
  "aria-invalid:border-[var(--attention)]";

function TextInput(props: React.ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

function PasswordInput(
  props: Omit<React.ComponentProps<"input">, "type">
) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={cn(inputClass, "pr-11")}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-0 top-0 h-11 w-11 inline-flex items-center justify-center rounded-[6px] text-[var(--ink-muted)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function SubmitButton({
  loading,
  children,
  loadingLabel,
}: {
  loading: boolean;
  children: React.ReactNode;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={cn(
        "w-full h-12 rounded-[10px] bg-[var(--brand)] text-primary-foreground text-[15px] font-bold",
        "inline-flex items-center justify-center gap-2 transition-colors duration-100",
        "hover:bg-[var(--brand-deep)] disabled:opacity-70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)]"
      )}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Notice({
  tone,
  children,
  className,
  id,
}: {
  tone: "attention" | "neutral";
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <p
      id={id}
      role={tone === "attention" ? "alert" : "status"}
      className={cn(
        "flex gap-2 text-[15px] leading-[1.45] rounded-[10px] px-3 py-3",
        tone === "attention"
          ? "bg-[var(--attention-tint)] text-[var(--attention-deep)]"
          : "bg-card border border-[var(--hairline)] text-[var(--ink)]",
        className
      )}
    >
      {tone === "attention" ? (
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}

function TextLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] underline-offset-4 hover:underline min-h-[44px] px-2 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {children}
    </button>
  );
}

function EmailSent({
  title,
  email,
  body,
  onBack,
  backLabel,
  onResend,
}: {
  title: string;
  email: string;
  body: string;
  onBack: () => void;
  backLabel: string;
  onResend?: () => Promise<boolean>;
}) {
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The form that had focus just unmounted; land on the new heading.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="text-center py-2">
      <div className="w-14 h-14 rounded-[14px] bg-[var(--surface)] border border-[var(--hairline)] flex items-center justify-center mx-auto mb-4">
        <MailCheck className="w-6 h-6 text-[var(--ink)]" aria-hidden="true" />
      </div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-[18px] font-bold text-[var(--ink)] mb-2 outline-none"
      >
        {title}
      </h2>
      <p role="status" className="text-[15px] text-[var(--ink-muted)]">
        We sent a link to{" "}
        <span className="font-semibold text-[var(--ink)] break-all">{email}</span>.
      </p>
      <p className="text-[15px] text-[var(--ink-muted)] mt-1">{body}</p>
      <p className="font-accent italic text-[13px] text-[var(--ink-muted)] mt-3">
        Not there? Check your spam folder.
      </p>
      <div className="flex flex-col items-center mt-4">
        {onResend ? (
          <TextLink
            onClick={async () => {
              // Supabase allows one confirmation email per address a minute;
              // block repeat taps instead of answering them with errors.
              if (resend === "sending" || resend === "sent") return;
              setResend("sending");
              const ok = await onResend();
              setResend(ok ? "sent" : "failed");
              if (ok) setTimeout(() => setResend("idle"), RESEND_COOLDOWN_MS);
            }}
          >
            {resend === "sending"
              ? "Sending…"
              : resend === "sent"
                ? "Sent again ✓"
                : resend === "failed"
                  ? "Couldn't resend — try again"
                  : "Resend the email"}
          </TextLink>
        ) : null}
        <TextLink onClick={onBack}>{backLabel}</TextLink>
      </div>
    </div>
  );
}

// One error per form. A validation error names its field: that input is
// marked invalid, points at the message, and takes focus.
function useFormError(ids: string) {
  const [state, setState] = useState<{ message: string; field: string | null; n: number }>({
    message: "",
    field: null,
    n: 0,
  });
  const errorId = `${ids}-error`;

  useEffect(() => {
    if (state.field) document.getElementById(`${ids}-${state.field}`)?.focus();
  }, [ids, state.field, state.n]);

  return {
    error: state.message,
    errorId,
    fail: (message: string, field: string | null = null) =>
      setState((s) => ({ message, field, n: s.n + 1 })),
    clear: () => setState((s) => ({ message: "", field: null, n: s.n })),
    invalid: (field: string) =>
      state.field === field
        ? { "aria-invalid": true as const, "aria-describedby": errorId }
        : {},
  };
}

// ─── Sign in ────────────────────────────────────────────────────────────────

function SignInPanel({
  email,
  setEmail,
  autoFocus,
}: {
  email: string;
  setEmail: (v: string) => void;
  autoFocus: boolean;
}) {
  const ids = useId();
  const [view, setView] = useState<"password" | "magic" | "magic-sent">("password");
  const [password, setPassword] = useState("");
  const { error, errorId, fail, clear, invalid } = useFormError(ids);
  const [loading, setLoading] = useState(false);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(issue?.message ?? "Check your details", String(issue?.path[0] ?? "email"));
      return;
    }

    setLoading(true);
    const { error: authError } = await callAuth("signInWithPassword", () =>
      getSupabaseClient().auth.signInWithPassword(parsed.data)
    );
    if (authError) {
      setLoading(false);
      if (isUnreachable(authError)) fail(UNREACHABLE);
      else if (authError.code === "email_not_confirmed")
        fail("Confirm your email first — open the link we sent you, then sign in.");
      else fail("Email or password is wrong. Try again.");
      return;
    }

    // Full navigation so the server gate at /app reads the new cookie.
    // The button keeps its spinner until the dashboard loads.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a hard load is the point
    window.location.assign("/app");
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "Enter a valid email", "magic-email");
      return;
    }

    setLoading(true);
    const { error: authError } = await callAuth("signInWithOtp", () =>
      getSupabaseClient().auth.signInWithOtp({
        email: parsed.data,
        options: { emailRedirectTo: callbackUrl() },
      })
    );
    setLoading(false);
    if (authError) {
      fail(
        isUnreachable(authError)
          ? UNREACHABLE
          : "We couldn't send the link. Check the address and try again."
      );
      return;
    }
    setView("magic-sent");
  };

  if (view === "magic-sent") {
    return (
      <EmailSent
        title="Check your email"
        email={email.trim()}
        body="Open it on this device to sign in. It expires in 1 hour."
        onBack={() => setView("password")}
        backLabel="Sign in with password instead"
      />
    );
  }

  if (view === "magic") {
    return (
      <form onSubmit={handleMagicLink} className="space-y-4" noValidate>
        <p className="text-[15px] text-[var(--ink-muted)]">
          We&apos;ll email you a link that signs you in — no password needed.
        </p>
        <Field label="Email address" htmlFor={`${ids}-magic-email`}>
          <TextInput
            id={`${ids}-magic-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            {...invalid("magic-email")}
          />
        </Field>
        {error ? <Notice tone="attention" id={errorId}>{error}</Notice> : null}
        <SubmitButton loading={loading} loadingLabel="Sending…">
          Email me a sign-in link
        </SubmitButton>
        <div className="flex justify-center">
          <TextLink
            onClick={() => {
              setView("password");
              clear();
            }}
          >
            Back to password sign-in
          </TextLink>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordSignIn} className="space-y-4" noValidate>
      <Field label="Email address" htmlFor={`${ids}-email`}>
        <TextInput
          id={`${ids}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus={autoFocus}
          {...invalid("email")}
        />
      </Field>
      <Field label="Password" htmlFor={`${ids}-password`}>
        <PasswordInput
          id={`${ids}-password`}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          {...invalid("password")}
        />
      </Field>
      {error ? <Notice tone="attention" id={errorId}>{error}</Notice> : null}
      <SubmitButton loading={loading} loadingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <div className="flex justify-center">
        <TextLink
          onClick={() => {
            setView("magic");
            clear();
          }}
        >
          Forgot password? Email me a sign-in link
        </TextLink>
      </div>
    </form>
  );
}

// ─── Sign up ────────────────────────────────────────────────────────────────

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
  autoFocus,
  onSignIn,
}: {
  email: string;
  setEmail: (v: string) => void;
  autoFocus: boolean;
  onSignIn: () => void;
}) {
  const ids = useId();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const { error, errorId, fail, clear, invalid } = useFormError(ids);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    setAlreadyRegistered(false);
    const parsed = signUpSchema.safeParse({
      full_name: fullName,
      company_name: companyName,
      email,
      password,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(
        issue?.message ?? "Check your details",
        SIGNUP_FIELD[String(issue?.path[0])] ?? null
      );
      return;
    }

    setLoading(true);
    const { error: authError } = await callAuth("signUp", () =>
      getSupabaseClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          // Land on /auth/callback so the session cookie is set server-side
          // and public.profiles is upserted from this metadata.
          emailRedirectTo: callbackUrl(),
          data: {
            full_name: parsed.data.full_name,
            company_name: parsed.data.company_name || null,
          },
        },
      })
    );
    setLoading(false);

    if (authError) {
      const msg = (authError.message ?? "").toLowerCase();
      if (isUnreachable(authError)) {
        fail(UNREACHABLE);
      } else if (msg.includes("already") || msg.includes("registered")) {
        setAlreadyRegistered(true);
      } else if (msg.includes("password")) {
        fail("Choose a stronger password — at least 8 characters.", "password");
      } else {
        fail("We couldn't create your account. Try again in a moment.");
      }
      return;
    }
    setSentTo(parsed.data.email);
  };

  if (sentTo) {
    return (
      <EmailSent
        title="Confirm your email"
        email={sentTo}
        body="Open it on this device to finish creating your account."
        onBack={() => setSentTo(null)}
        backLabel="Use a different email"
        onResend={async () => {
          const { error: resendError } = await callAuth("resend", () =>
            getSupabaseClient().auth.resend({
              type: "signup",
              email: sentTo,
              options: { emailRedirectTo: callbackUrl() },
            })
          );
          return !resendError;
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSignUp} className="space-y-4" noValidate>
      <Field label="Full name" htmlFor={`${ids}-name`}>
        <TextInput
          id={`${ids}-name`}
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Alex Andersson"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoFocus={autoFocus}
          {...invalid("name")}
        />
      </Field>
      <Field label="Company" hint="Optional" htmlFor={`${ids}-company`}>
        <TextInput
          id={`${ids}-company`}
          type="text"
          autoComplete="organization"
          placeholder="Acme AB"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          {...invalid("company")}
        />
      </Field>
      <Field label="Work email" htmlFor={`${ids}-email`}>
        <TextInput
          id={`${ids}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          {...invalid("email")}
        />
      </Field>
      <Field label="Password" hint="8+ characters" htmlFor={`${ids}-password`}>
        <PasswordInput
          id={`${ids}-password`}
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          {...invalid("password")}
        />
      </Field>
      {alreadyRegistered ? (
        <div>
          <Notice tone="attention">That email already has an account.</Notice>
          <div className="flex justify-center">
            <TextLink onClick={onSignIn}>Sign in instead</TextLink>
          </div>
        </div>
      ) : error ? (
        <Notice tone="attention" id={errorId}>{error}</Notice>
      ) : null}
      <SubmitButton loading={loading} loadingLabel="Creating your account…">
        Create account
      </SubmitButton>
      <p className="text-[13px] leading-[1.45] text-[var(--ink-muted)] text-center">
        How we handle your data is explained in our{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-[var(--ink)] rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          privacy notice
        </a>
        .
      </p>
    </form>
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
      className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-50 min-h-[44px] px-2 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {busy ? "Resetting…" : "Trouble signing in? Reset your session"}
    </button>
  );
}
