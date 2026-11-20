// Who is signed in, and the two sign-in steps: ask for a code, check it.
// The same Supabase email code as the website's login
// (src/app/app/login/_code-step.tsx), with the same error rules.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { API_URL } from "../config";
import { finishSignIn } from "../lib/api";
import { clearAll } from "../lib/cache";
import { RESEND_AFTER_S, recentCodeWait } from "../lib/code-send";
import { supabase } from "../lib/supabase";

/** alreadySent: a code went to this address less than a minute ago; use it. */
export type RequestResult = "sent" | "alreadySent" | "rateLimited" | "unreachable" | "failed";
/** waitS: seconds until another code may be asked for (0 when none is waiting). */
export type RequestOutcome = { result: RequestResult; waitS: number };
export type VerifyResult = "ok" | "wrong" | "expired" | "unreachable";

type AuthState = {
  status: "loading" | "signedOut" | "signedIn";
  userId: string | null;
  email: string | null;
  requestCode: (email: string) => Promise<RequestOutcome>;
  verifyCode: (email: string, code: string) => Promise<VerifyResult>;
  /** App Review's account only (REVIEW_EMAIL); everyone else uses the code. */
  signInWithPassword: (email: string, password: string) => Promise<"ok" | "wrong" | "unreachable">;
  /** keepScans: the server ended the session; unsent scans stay for the next sign-in. */
  signOut: (options?: { keepScans?: boolean }) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function isUnreachable(error: AuthError): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.name === "AuthRetryableFetchError" ||
    msg.includes("network") ||
    msg.includes("timed out") ||
    msg.includes("failed to fetch")
  );
}

function isRateLimited(error: AuthError): boolean {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    (error.message ?? "").toLowerCase().includes("rate limit")
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const requestCode = useCallback(async (email: string): Promise<RequestOutcome> => {
    // Never ask Supabase for a code without an address (it answers 400).
    if (!email?.trim()) return { result: "failed", waitS: 0 };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // The email carries only the code (supabase/templates/README.md).
      options: { emailRedirectTo: `${API_URL}/auth/callback?next=/app` },
    });
    if (!error) return { result: "sent", waitS: RESEND_AFTER_S };
    // Refused because a code went to this address under a minute ago: that
    // code is valid, so the person goes on to type it.
    const recent = recentCodeWait(error);
    if (recent !== null) return { result: "alreadySent", waitS: recent };
    if (isRateLimited(error)) return { result: "rateLimited", waitS: 0 };
    if (isUnreachable(error)) return { result: "unreachable", waitS: 0 };
    return { result: "failed", waitS: 0 };
  }, []);

  const verifyCode = useCallback(async (email: string, code: string): Promise<VerifyResult> => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (!error) {
      finishSignIn();
      return "ok";
    }
    if (isUnreachable(error)) return "unreachable";
    const msg = (error.message ?? "").toLowerCase();
    return msg.includes("expired") || error.code === "otp_expired" ? "expired" : "wrong";
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      finishSignIn();
      return "ok" as const;
    }
    return isUnreachable(error) ? ("unreachable" as const) : ("wrong" as const);
  }, []);

  const signOut = useCallback(async (options?: { keepScans?: boolean }) => {
    await clearAll(options);
    // This iPhone only: the user stays signed in on their computer.
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  // Keyed on who is signed in, not on the session object: the hourly token
  // refresh makes a new session and used to render the whole app again.
  const status: AuthState["status"] = session === undefined ? "loading" : session ? "signedIn" : "signedOut";
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;
  const value = useMemo<AuthState>(
    () => ({ status, userId, email, requestCode, verifyCode, signInWithPassword, signOut }),
    [status, userId, email, requestCode, verifyCode, signInWithPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
