import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import { AuthCard, type AuthMode } from "./_auth-card";

export const metadata: Metadata = {
  title: "Sign in — UnReceipt",
  // A login form has nothing for search engines; the marketing pages do.
  robots: { index: false, follow: true },
};

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string;
    error?: string;
    account?: string;
    reauth?: string;
  }>;
};

// Server shell: reads the query and the pilot flag so the form renders in the
// right mode on first paint (no flash from Sign in to Create account).
// "Join the pilot" links land here with ?mode=signup.
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const initialMode: AuthMode = params.mode === "signup" ? "signup" : "signin";
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
    />
  );
}
