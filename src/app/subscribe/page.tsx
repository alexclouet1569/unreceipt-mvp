import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Receipt, Check, ArrowRight } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
import { isPilotMode } from "@/lib/pilot";
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">UnReceipt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Forward any receipt — we read it for you
          </p>
        </div>

        <Card>
          <CardContent className="py-6 px-6 space-y-5">
            <ul className="space-y-2.5">
              {[
                "First week free on every plan",
                "Forward receipts to your private address",
                "Receipts read within a minute, VAT included",
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
                <p className="text-sm text-foreground bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
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
