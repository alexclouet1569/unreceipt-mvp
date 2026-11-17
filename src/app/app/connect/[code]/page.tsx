import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase-server";
import { Wordmark } from "@/components/brand/Wordmark";
import { iosAppUrl } from "@/lib/app-url";
import { isJoinCodeShape, joinPath, loadJoinTarget } from "@/lib/firm/join-link";
import { connectState } from "@/lib/firm/connect";
import { ConnectCard, type ConnectView } from "./_connect-card";

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
// /api/firm-connect) connects. Signed-out visitors sign in or sign up first
// and come back here (?next=).
export default async function ConnectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getServerUser();
  if (!user) {
    redirect(`/app/login?next=${encodeURIComponent(isJoinCodeShape(code) ? joinPath(code) : "/app")}`);
  }

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
    <div className="min-h-screen bg-background">
      <header className="border-b border-[var(--hairline)]">
        <div className="max-w-[540px] mx-auto px-4 h-14 flex items-center">
          <Link href="/app" aria-label="UnReceipt" className="inline-flex h-11 items-center">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="max-w-[540px] mx-auto px-4 pt-16 pb-10">
        <ConnectCard view={view} code={code} email={user.email ?? null} appUrl={iosAppUrl()} />
      </main>
    </div>
  );
}
