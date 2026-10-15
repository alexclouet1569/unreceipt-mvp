"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase-client";
import { cn } from "@/lib/utils";
import {
  CODE_LENGTH,
  RESEND_COOLDOWN_S,
  callAuth,
  finishSignIn,
  inboxFor,
  isRateLimited,
  isUnreachable,
  shake,
  UNREACHABLE,
  type AuthResult,
} from "./_auth-lib";
import { Notice, SecondaryButton, TextLink, useCountdown } from "./_auth-ui";

// How often to look for a session created by the email's link in another
// tab (the callback route sets the same cookies this tab reads).
const LINK_POLL_MS = 3_000;

type CodeStepProps = {
  email: string;
  purpose: "signup" | "signin";
  /** Sends the email again. */
  resend: () => Promise<AuthResult>;
  onChangeEmail: () => void;
  onSignInInstead?: () => void;
};

export function CodeStep({ email, purpose, resend, onChangeEmail, onSignInInstead }: CodeStepProps) {
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(true);
  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle");
  const [error, setError] = useState("");
  const [resendNote, setResendNote] = useState("");
  const [sendCount, setSendCount] = useState(0);
  const secondsLeft = useCountdown(RESEND_COOLDOWN_S, sendCount);
  const inputRef = useRef<HTMLInputElement>(null);
  const cellsRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const inbox = inboxFor(email);

  const complete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStatus("done");
    void finishSignIn();
  };

  const verify = async (token: string) => {
    setStatus("checking");
    setError("");
    const { error: authError } = await callAuth("verifyOtp", () =>
      getSupabaseClient().auth.verifyOtp({ email, token, type: "email" })
    );
    if (!authError) {
      complete();
      return;
    }
    const msg = (authError.message ?? "").toLowerCase();
    setStatus("idle");
    setCode("");
    setError(
      isUnreachable(authError)
        ? UNREACHABLE
        : msg.includes("expired") || authError.code === "otp_expired"
          ? "That code has expired or was already used. Use the newest email, or ask for a new code below."
          : "That code isn't right. Check the latest email and try again."
    );
    shake(cellsRef.current);
    inputRef.current?.focus();
  };

  // The person may tap the link in the email instead — often in another tab.
  // When that tab finishes signing in, follow it here too.
  useEffect(() => {
    const check = async () => {
      if (doneRef.current || document.visibilityState !== "visible") return;
      const { data } = await getSupabaseClient().auth.getSession();
      if (data.session?.user?.email?.toLowerCase() === email.toLowerCase()) complete();
    };
    const t = setInterval(check, LINK_POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
    // complete() only reads refs and stable setters.
  }, [email]);

  const handleResend = async () => {
    setResendNote("");
    setError("");
    const { error: resendError } = await resend();
    if (resendError) {
      setResendNote(
        isRateLimited(resendError)
          ? "Please wait a minute before asking for another code."
          : isUnreachable(resendError)
            ? UNREACHABLE
            : "We couldn't send a new code. Try again in a moment."
      );
      return;
    }
    setCode("");
    setSendCount((n) => n + 1);
    setResendNote("New code sent. Use the latest email.");
    inputRef.current?.focus();
  };

  const digits = code.split("");
  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div>
      <h1
        id="auth-title"
        className="font-display text-[24px] leading-[1.15] tracking-[-0.02em] font-bold text-[var(--ink)]"
      >
        {purpose === "signup" ? "Confirm your email" : "Check your inbox"}
      </h1>
      <p className="text-[15px] leading-[1.5] text-[var(--ink-muted)] mt-2">
        Enter the {CODE_LENGTH}-digit code we sent to
        <span className="block font-semibold text-[var(--ink)] [overflow-wrap:anywhere]">{email}</span>
      </p>

      <div className="relative mt-6" ref={cellsRef}>
        <label htmlFor="auth-code" className="sr-only">
          {CODE_LENGTH}-digit code
        </label>
        <input
          ref={inputRef}
          id="auth-code"
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
            setCode(next);
            if (error) setError("");
            if (next.length === CODE_LENGTH && status === "idle") void verify(next);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          disabled={status !== "idle"}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "auth-code-error" : undefined}
          // Covers the cells so a tap anywhere focuses it; visually hidden.
          className="absolute inset-0 w-full h-full opacity-0 text-[16px] cursor-text"
        />
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${CODE_LENGTH}, 1fr)` }} aria-hidden="true">
          {Array.from({ length: CODE_LENGTH }, (_, i) => {
            const filled = i < digits.length;
            const active = focused && status === "idle" && i === activeIndex && !filled;
            return (
              <div
                key={i}
                className={cn(
                  "h-14 rounded-[10px] border bg-card flex items-center justify-center",
                  "font-display text-[24px] font-bold tabular-nums text-[var(--ink)]",
                  "transition-[border-color,box-shadow] duration-100",
                  error
                    ? "border-[var(--attention)]"
                    : active
                      ? "border-[var(--ring)] ring-4 ring-[var(--ring)]/15"
                      : filled
                        ? "border-[color-mix(in_srgb,var(--ink)_35%,var(--hairline))]"
                        : "border-[var(--hairline)]",
                  status === "done" ? "border-[var(--ring)]" : ""
                )}
              >
                {filled ? (
                  <span className="animate-in fade-in zoom-in-90" style={{ animationDuration: "120ms" }}>
                    {digits[i]}
                  </span>
                ) : active ? (
                  <span className="w-[2px] h-6 bg-[var(--ink)] animate-pulse" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-h-[24px] mt-3" aria-live="polite">
        {status === "checking" ? (
          <p className="text-[13px] text-[var(--ink-muted)]">Checking…</p>
        ) : status === "done" ? (
          <p className="text-[13px] font-semibold text-[var(--ink)]">
            You&apos;re in — opening your receipts…
          </p>
        ) : null}
      </div>
      {error ? (
        <Notice tone="attention" id="auth-code-error">
          {error}
        </Notice>
      ) : null}

      {inbox ? (
        <div className="mt-4">
          <SecondaryButton href={inbox.url}>
            {inbox.label}
            <ExternalLink className="w-4 h-4 text-[var(--ink-muted)]" aria-hidden="true" />
          </SecondaryButton>
        </div>
      ) : null}

      <p className="text-[13px] leading-[1.5] text-[var(--ink-muted)] mt-5">
        The email also has a button — tapping it works too, even on another
        device. Not there after a minute? Check your spam folder.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-2 mt-3 -mx-2">
        <TextLink onClick={handleResend} disabled={secondsLeft > 0 || status !== "idle"}>
          {secondsLeft > 0 ? `Send a new code in ${minutes}:${seconds}` : "Send a new code"}
        </TextLink>
        <TextLink onClick={onChangeEmail}>Change email</TextLink>
      </div>
      {resendNote ? (
        <p className="text-[13px] text-[var(--ink-muted)]" role="status">
          {resendNote}
        </p>
      ) : null}

      {purpose === "signup" && onSignInInstead ? (
        <div className="flex items-center gap-1 text-[13px] text-[var(--ink-muted)] mt-4 pt-2 border-t border-[var(--hairline)]">
          <span>Already have an account?</span>
          <TextLink onClick={onSignInInstead}>Sign in</TextLink>
        </div>
      ) : null}
    </div>
  );
}
