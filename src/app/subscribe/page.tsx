import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Receipt, Check, ArrowRight } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import { isPilotMode } from "@/lib/pilot";
import { getNativeApp } from "@/lib/native-app-server";
import { SubscribeButton } from "./SubscribeButton";

export const dynamic = "force-dynamic";

type SubscribePageProps = {
  searchParams: Promise<{ canceled?: string }>;
};

export default async function SubscribePage({
  searchParams,
}: SubscribePageProps) {
  const user = await getServerUser();
  if (!user) {
    redirect("/app/login");
  }

  const { canceled } = await searchParams;
  const pilot = isPilotMode();

  // The store apps sell nothing and point to no purchase elsewhere (App
  // Store 3.1.3(f), src/lib/native-app.ts): no plans, prices, trial or
  // Checkout, and no "subscribe on the website".
  if (await getNativeApp()) {
    return <StoreAppAccountScreen pilot={pilot} email={user.email ?? null} />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">UnReceipt Concierge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Forward any receipt — we make it VAT-ready
          </p>
        </div>

        <Card>
          <CardContent className="py-6 px-6 space-y-5">
            <ul className="space-y-2.5">
              {[
                "First week free on every plan",
                "Forward receipts to your private address",
                "VAT-ready records in your dashboard within 24h",
                "Cancel anytime — no questions asked",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {canceled && !pilot ? (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                Checkout canceled. Pick it back up anytime.
              </p>
            ) : null}

            {pilot ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--attention-deep)] bg-[var(--attention-tint)] border border-[var(--attention)] rounded-md px-3 py-2.5">
                  We&apos;re running a free pilot right now — no subscription
                  needed. After the pilot, plans start at €5.99 per month (excl.
                  VAT) for the whole company.
                </p>
                <Link
                  href="/app"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Continue to dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <SubscribeButton />
            )}

            <p className="text-[11px] text-muted-foreground text-center">
              Signed in as{" "}
              <span className="font-medium text-foreground">{user.email}</span>
            </p>
          </CardContent>
        </Card>

        <div className="text-center mt-6 space-y-1">
          <Link
            href="/app"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back to dashboard
          </Link>
          {/* Without a subscription /app sends you back here; Settings
              stays open so a cancelled customer can export their receipts
              (the 90 days the privacy page promises) or delete the account. */}
          <div>
            <Link
              href="/app/settings"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Download your receipts or delete your account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreAppAccountScreen({ pilot, email }: { pilot: boolean; email: string | null }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Shown inside the store app, so it follows DESIGN.md cards. */}
        <div
          className="bg-card space-y-4"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "20px" }}
        >
            {pilot ? (
              <>
                <h1 className="font-display font-bold text-[22px] text-[var(--ink)]">You&apos;re in the free pilot</h1>
                <p className="text-sm text-muted-foreground">
                  Everything is open to you during the pilot.
                </p>
                <Link
                  href="/app"
                  className="inline-flex w-full h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-[15px] font-semibold text-primary-foreground hover:opacity-90 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Continue to your receipts
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </>
            ) : (
              <>
                <h1 className="font-display font-bold text-[22px] text-[var(--ink)]">This account isn&apos;t active</h1>
                <p className="text-sm text-muted-foreground">
                  There&apos;s no active UnReceipt plan on this account, so new
                  receipts can&apos;t be added right now. Everything you&apos;ve
                  saved is safe: you can download it or delete the account in
                  Settings.
                </p>
                <Link
                  href="/app/settings"
                  className="inline-flex w-full h-11 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--hairline)] px-4 text-[15px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Open Settings
                </Link>
              </>
            )}
            {email ? (
              <p className="text-[13px] text-muted-foreground text-center">
                Signed in as <span className="font-medium text-foreground">{email}</span>
              </p>
            ) : null}
        </div>
      </div>
    </div>
  );
}
