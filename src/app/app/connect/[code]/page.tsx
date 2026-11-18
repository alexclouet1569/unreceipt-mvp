import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getServerUser } from "@/lib/supabase-server";
import { loginPath } from "@/app/auth/callback/safe-next";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { Wordmark } from "@/components/brand/Wordmark";
import { iosAppUrl } from "@/lib/app-url";
import { isJoinCodeShape, joinPath, loadJoinFirmName, loadJoinTarget } from "@/lib/firm/join-link";
import { connectState } from "@/lib/firm/connect";
import { ConnectCard, SignedOutConnectCard, type ConnectView } from "./_connect-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Share your receipts with your accountant",
  robots: { index: false, follow: false },
  // Invite tokens and join codes travel in this page's URL (or its ?next=):
  // links and requests from it send only our origin as referrer, so the
  // token never reaches analytics or another page (src/lib/tracking/scrub.ts).
  referrer: "strict-origin",
};

// An accounting firm's join link (src/lib/firm/join-link.ts). GET never
// changes anything: it names the firm, the domain of its admin's email, and
// what the signed-in user's company would share; only "Yes, share" (POST
// /api/firm-connect) connects. Signed-out visitors see what UnReceipt is and
// the firm's name, then create an account (or sign in) and come back here
// (?next=), where the question is asked.
export default async function ConnectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getServerUser();
  if (!user) return <Shell>{await signedOut(code)}</Shell>;

  let view: ConnectView;
  try {
    const target = await loadJoinTarget(code);
    view = target
      ? { firmName: target.firmName, adminDomain: target.adminDomain, state: await connectState(user, target) }
      : { state: { kind: "missing" } };
  } catch (err) {
    console.error("[/app/connect] load failed", err instanceof Error ? err.message : "error");
    view = { state: { kind: "error" } };
  }

  return (
    <Shell>
      <ConnectCard view={view} code={code} email={user.email ?? null} appUrl={iosAppUrl()} />
    </Shell>
  );
}

// No database read for a code that can't be one; a well-formed code reads
// only the firm's name, after a per-IP limit (over it, or on a database
// error, the page names nobody rather than failing).
async function signedOut(code: string) {
  if (!isJoinCodeShape(code)) {
    return <SignedOutConnectCard missing firmName={null} signupHref="" signinHref="" />;
  }
  let firmName: string | null = null;
  let missing = false;
  const limited = await rateLimit("connectView", clientIpFrom(await headers()));
  if (limited.ok) {
    try {
      firmName = await loadJoinFirmName(code);
      missing = firmName === null;
    } catch (err) {
      console.error("[/app/connect] signed-out load failed", err instanceof Error ? err.message : "error");
    }
  }
  const next = joinPath(code);
  return (
    <SignedOutConnectCard
      missing={missing}
      firmName={firmName}
      signupHref={loginPath(next, { signup: true })}
      signinHref={loginPath(next)}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[var(--hairline)]">
        <div className="max-w-[540px] mx-auto px-4 h-14 flex items-center">
          <Link href="/app" aria-label="UnReceipt" className="inline-flex h-11 items-center">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="max-w-[540px] mx-auto px-4 pt-16 pb-10">{children}</main>
    </div>
  );
}
