import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Receipt, Check } from "lucide-react";
import { getServerUser } from "@/lib/supabase-server";
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
                "First week free, then €49/month",
                "Forward receipts to your concierge inbox",
                "VAT-ready records ready in your dashboard within 24h",
                "Cancel anytime in Stripe — no questions asked",
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

            {canceled ? (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                Checkout canceled. Pick it back up anytime.
              </p>
            ) : null}

            <SubscribeButton />

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
        </div>
      </div>
    </div>
  );
}
