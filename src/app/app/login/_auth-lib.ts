"use client";

import { z } from "zod";
import { withTimeout } from "@/lib/with-timeout";

export type AuthMode = "signin" | "signup";

// Must match Supabase → Authentication → Providers → Email → "Email OTP
// Length" (6 is Supabase's default). The emails show the same code.
export const CODE_LENGTH = 6;

// Supabase sends at most one email per address per 60 s by default.
export const RESEND_COOLDOWN_S = 60;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

export const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100),
  company_name: z.string().trim().max(100).optional().or(z.literal("")),
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

// Safety net, not the normal path: supabase-js calls answer in well under a
// second. If one doesn't, say so instead of spinning forever.
const AUTH_TIMEOUT_MS = 12_000;

export const UNREACHABLE =
  "We couldn't reach the sign-in service. Check your connection and try again.";

export type AuthError = { message?: string; code?: string; status?: number };
export type AuthResult = { error: AuthError | null };

export async function callAuth(
  label: string,
  run: () => PromiseLike<AuthResult>
): Promise<AuthResult> {
  try {
    return await withTimeout(label, AUTH_TIMEOUT_MS, run());
  } catch (e) {
    return {
      error: {
        message: e instanceof Error ? e.message : "request failed",
        code: "unreachable",
      },
    };
  }
}

export function isUnreachable(error: AuthError): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "unreachable" ||
    msg.includes("timed out") ||
    msg.includes("failed to fetch") ||
    msg.includes("network")
  );
}

export function isRateLimited(error: AuthError): boolean {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    (error.message ?? "").toLowerCase().includes("rate limit")
  );
}

export function callbackUrl(): string {
  return `${window.location.origin}/auth/callback?next=/app`;
}

// After a code (or a link in another tab) signs the person in: mirror their
// sign-up details into their profile and queue the welcome email — the same
// work /auth/callback does for links. Best-effort; never blocks the redirect.
export async function finishSignIn(): Promise<void> {
  try {
    await withTimeout(
      "auth/finish",
      5_000,
      fetch("/api/auth/finish", { method: "POST" })
    );
  } catch {
    /* the dashboard works without it */
  }
  // Full navigation so the server gate at /app reads the new cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a hard load is the point
  window.location.assign("/app");
}

// ─── Email helpers ──────────────────────────────────────────────────────────

const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.co": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

/** "alex@gmial.com" → "alex@gmail.com"; null when nothing looks wrong. */
export function suggestEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fix = DOMAIN_TYPOS[email.slice(at + 1)];
  return fix ? `${email.slice(0, at)}@${fix}` : null;
}

/** A web inbox to open for well-known providers, so nobody hunts for it. */
export function inboxFor(email: string): { label: string; url: string } | null {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { label: "Open Gmail", url: "https://mail.google.com/mail/u/0/#search/from%3Aunreceipt" };
  }
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return { label: "Open Outlook", url: "https://outlook.live.com/mail/" };
  }
  if (["icloud.com", "me.com", "mac.com"].includes(domain)) {
    return { label: "Open iCloud Mail", url: "https://www.icloud.com/mail" };
  }
  if (domain.startsWith("yahoo.")) {
    return { label: "Open Yahoo Mail", url: "https://mail.yahoo.com" };
  }
  return null;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Small horizontal shake for a rejected input (Web Animations API). */
export function shake(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 320, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
  );
}
