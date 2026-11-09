// Who is signed in, and the two sign-in steps: ask for a code, check it.
// The same Supabase email code as the website's login
// (src/app/app/login/_code-step.tsx), with the same error rules.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { API_URL } from "../config";
import { finishSignIn } from "../lib/api";
import { clearAll } from "../lib/cache";
import { supabase } from "../lib/supabase";

export type RequestResult = "sent" | "rateLimited" | "unreachable" | "failed";
export type VerifyResult = "ok" | "wrong" | "expired" | "unreachable";

type AuthState = {
  status: "loading" | "signedOut" | "signedIn";
  userId: string | null;
  email: string | null;
  requestCode: (email: string) => Promise<RequestResult>;
  verifyCode: (email: string, code: string) => Promise<VerifyResult>;
  signOut: () => Promise<void>;
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

  const requestCode = useCallback(async (email: string): Promise<RequestResult> => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // The email also carries a link; it opens the website, the code is
      // what the app uses.
      options: { emailRedirectTo: `${API_URL}/auth/callback?next=/app` },
    });
    if (!error) return "sent";
    if (isRateLimited(error)) return "rateLimited";
    if (isUnreachable(error)) return "unreachable";
    return "failed";
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

  const signOut = useCallback(async () => {
    await clearAll();
    // This iPhone only: the user stays signed in on their computer.
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status: session === undefined ? "loading" : session ? "signedIn" : "signedOut",
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      requestCode,
      verifyCode,
      signOut,
    }),
    [session, requestCode, verifyCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
