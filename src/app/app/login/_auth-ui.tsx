"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { suggestEmail } from "./_auth-lib";

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

// DESIGN.md entrance easing (Apple spring-out) and "medium" duration.
export const ENTER = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Fades + lifts its children in whenever `stepKey` changes, so moving
 * between steps feels continuous instead of a hard swap. Disabled under
 * prefers-reduced-motion by the global rule in globals.css.
 */
export function Step({ stepKey, children }: { stepKey: string; children: React.ReactNode }) {
  return (
    <div
      key={stepKey}
      className="animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDuration: "320ms", animationTimingFunction: ENTER }}
    >
      {children}
    </div>
  );
}

// ─── Fields ─────────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  /** Inline message under the field (honey, never red). */
  error?: string | null;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between text-[13px] font-semibold text-[var(--ink)] mb-2"
      >
        <span>{label}</span>
        {hint ? <span className="font-medium text-[var(--ink-muted)]">{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <p
          id={errorId}
          // Announced even when the field already has focus (Enter pressed in it).
          role="alert"
          className="flex items-center gap-1 mt-2 text-[13px] font-medium text-[var(--attention-deep)] animate-in fade-in"
          style={{ animationDuration: "200ms", animationTimingFunction: ENTER }}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full h-12 rounded-[6px] border border-[var(--hairline)] bg-card px-4 text-[16px] text-[var(--ink)] " +
  "placeholder:text-[var(--ink-faint)] outline-none transition-[border-color,box-shadow] duration-100 " +
  "focus:border-[var(--ring)] focus:ring-4 focus:ring-[var(--ring)]/15 " +
  "aria-invalid:border-[var(--attention)] aria-invalid:focus:ring-[var(--attention)]/20";

export function TextInput(props: React.ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

/** Email input that offers a fix for common domain typos ("gmial.com"). */
export function EmailInput({
  value,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);
  const suggestion = checked ? suggestEmail(value) : null;

  return (
    <>
      <input
        {...props}
        type="email"
        inputMode="email"
        autoComplete={props.autoComplete ?? "email"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setChecked(false);
        }}
        onBlur={(e) => {
          setChecked(true);
          props.onBlur?.(e);
        }}
        className={cn(inputClass, props.className)}
      />
      {suggestion ? (
        <button
          type="button"
          onClick={() => {
            onValueChange(suggestion);
            setChecked(false);
          }}
          className={cn(
            "inline-flex items-center min-h-[44px] -my-2 mt-0 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-[6px] animate-in fade-in",
            FOCUS_RING
          )}
          style={{ animationDuration: "200ms", animationTimingFunction: ENTER }}
        >
          <span>
            {t.auth.didYouMean}{" "}
            <span className="font-semibold text-[var(--ink)] underline underline-offset-2">
              {suggestion}
            </span>
            {t.auth.didYouMeanEnd}
          </span>
        </button>
      ) : null}
    </>
  );
}

/** Password field with show/hide, a Caps Lock warning and an optional 8+ rule. */
export function PasswordInput({
  showRule = false,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { showRule?: boolean }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const ruleId = props.id ? `${props.id}-rule` : undefined;
  const describedBy =
    [props["aria-describedby"], showRule ? ruleId : null].filter(Boolean).join(" ") || undefined;
  const [capsLock, setCapsLock] = useState(false);
  const length = typeof props.value === "string" ? props.value.length : 0;
  const ruleMet = length >= 8;

  const readCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);

  return (
    <>
      <div className="relative">
        <input
          {...props}
          aria-describedby={describedBy}
          type={show ? "text" : "password"}
          onKeyDown={(e) => {
            readCaps(e);
            props.onKeyDown?.(e);
          }}
          onKeyUp={readCaps}
          onBlur={(e) => {
            setCapsLock(false);
            props.onBlur?.(e);
          }}
          className={cn(inputClass, "pr-12")}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
          aria-pressed={show}
          className={cn(
            "absolute right-0.5 top-0.5 h-11 w-11 inline-flex items-center justify-center rounded-[8px]",
            "text-[var(--ink-muted)] hover:text-[var(--ink)]",
            FOCUS_RING
          )}
        >
          {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
        </button>
      </div>
      {capsLock ? (
        <p className="mt-2 text-[13px] font-medium text-[var(--attention-deep)]" role="status">
          {t.auth.capsLock}
        </p>
      ) : showRule ? (
        <p
          id={ruleId}
          className={cn(
            "flex items-center gap-1.5 mt-2 text-[13px] transition-colors duration-200",
            ruleMet ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"
          )}
        >
          <span
            className={cn(
              "inline-flex w-4 h-4 rounded-full items-center justify-center border transition-colors duration-200",
              ruleMet
                ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--card)]"
                : "border-[var(--hairline)]"
            )}
            aria-hidden="true"
          >
            {ruleMet ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
          </span>
          {t.auth.passwordRule}
        </p>
      ) : null}
    </>
  );
}

// ─── Actions ────────────────────────────────────────────────────────────────

export type SubmitState = "idle" | "loading" | "done";

export function SubmitButton({
  state,
  children,
  loadingLabel,
  doneLabel,
  disabled,
}: {
  state: SubmitState;
  children: React.ReactNode;
  loadingLabel: string;
  doneLabel: string;
  disabled?: boolean;
}) {
  const busy = state !== "idle";
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      aria-busy={state === "loading"}
      className={cn(
        "relative w-full h-12 rounded-[10px] bg-[var(--primary)] text-primary-foreground text-[15px] font-bold",
        "inline-flex items-center justify-center gap-2",
        "transition-[background-color,transform,opacity] duration-100 active:scale-[0.985]",
        "hover:bg-[var(--brand-action-deep)] disabled:cursor-default",
        state === "idle" && disabled ? "opacity-60" : "",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)]"
      )}
    >
      {state === "loading" ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : state === "done" ? (
        <span
          className="inline-flex items-center gap-2 animate-in fade-in zoom-in-95"
          style={{ animationDuration: "200ms", animationTimingFunction: ENTER }}
        >
          <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
          {doneLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  href,
  children,
}: {
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const className = cn(
    "w-full h-12 rounded-[10px] border border-[var(--hairline)] bg-card text-[15px] font-semibold text-[var(--ink)]",
    "inline-flex items-center justify-center gap-2 transition-colors duration-100",
    "hover:bg-[var(--surface)] active:scale-[0.985]",
    FOCUS_RING
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only">{t.auth.opensNewTab}</span>
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function TextLink({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-[13px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] underline-offset-4 hover:underline",
        "min-h-[44px] px-2 rounded-[6px] disabled:no-underline disabled:cursor-default disabled:opacity-70",
        FOCUS_RING
      )}
    >
      {children}
    </button>
  );
}

export function Notice({
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
    <div
      id={id}
      role={tone === "attention" ? "alert" : "status"}
      className={cn(
        "flex gap-2 text-[14px] leading-[1.45] rounded-[10px] px-3 py-3 animate-in fade-in slide-in-from-top-1",
        tone === "attention"
          ? "bg-[var(--attention-tint)] text-[var(--attention-deep)]"
          : "bg-card border border-[var(--hairline)] text-[var(--ink)]",
        className
      )}
      style={{ animationDuration: "200ms", animationTimingFunction: ENTER }}
    >
      {tone === "attention" ? (
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      ) : null}
      <div>{children}</div>
    </div>
  );
}

/** Counts down from `seconds` while `running`; returns the seconds left. */
export function useCountdown(seconds: number, runKey: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    // runKey changes restart the timer (e.g. after each resend).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on restart
    setLeft(seconds);
    const t = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds, runKey]);
  return left;
}
