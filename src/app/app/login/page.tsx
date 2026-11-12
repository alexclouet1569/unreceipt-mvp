import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import { getNativeApp } from "@/lib/native-app-server";
import { safeNext } from "@/app/auth/callback/safe-next";
import { AuthCard, type AuthMode } from "./_auth-card";

export const metadata: Metadata = {
  // The root layout appends " | UnReceipt".
  title: "Sign in",
  // A login form has nothing for search engines; the marketing pages do.
  robots: { index: false, follow: true },
};

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string;
    error?: string;
    account?: string;
    reauth?: string;
    next?: string | string[];
  }>;
};

// Server shell: reads the query and the pilot flag so the form renders in the
// right mode on first paint (no flash from Sign in to Create account).
// "Join the pilot" links land here with ?mode=signup. ?next= (an invite
// link, /firm) is where every way of signing in continues to, checked by
// the same rule as /auth/callback (same-origin paths only, else /app).
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const initialMode: AuthMode = params.mode === "signup" ? "signup" : "signin";
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const notice =
    params.account === "deleted"
      ? "Your account and receipts have been deleted."
      : params.reauth === "1"
        ? "Sign in again to continue — then open Settings to finish."
        : null;

  return (
    <AuthCard
      initialMode={initialMode}
      pilot={isPilotMode()}
      linkError={Boolean(params.error)}
      notice={notice}
      inStoreApp={Boolean(await getNativeApp())}
      next={next}
    />
  );
}
