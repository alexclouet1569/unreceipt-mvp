import type { Metadata } from "next";
import { isPilotMode } from "@/lib/pilot";
import { getI18n } from "@/lib/i18n/server";
import { AuthCard, type AuthMode } from "./_auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    // The root layout appends " | UnReceipt".
    title: t.auth.pageTitle,
    // A login form has nothing for search engines; the marketing pages do.
    robots: { index: false, follow: true },
  };
}

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
  const { t } = await getI18n();
  const initialMode: AuthMode = params.mode === "signup" ? "signup" : "signin";
  const notice =
    params.account === "deleted"
      ? t.auth.accountDeleted
      : params.reauth === "1"
        ? t.auth.reauth
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
