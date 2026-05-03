import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ReceiptListItem } from "@/components/receipt/ReceiptListItem";
import { formatAmount } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";
import { PasteForm } from "./PasteForm";

export const dynamic = "force-dynamic";

const RECEIPT_FETCH_LIMIT = 20;

type PageProps = {
  params: Promise<{ userId: string }>;
};

async function loadCustomer(userId: string) {
  const supabase = getSupabaseAdmin();

  const [userRes, subRes, receiptsRes] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from("subscriptions")
      .select("status, current_period_end, trial_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("receipts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RECEIPT_FETCH_LIMIT),
  ]);

  if (userRes.error || !userRes.data.user) return null;

  const receipts = (receiptsRes.data ?? []) as Receipt[];

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString().slice(0, 10);

  const monthTotal = receipts
    .filter((r) => (r.receipt_date ?? "") >= monthIso)
    .reduce((sum, r) => sum + (r.total ?? 0), 0);

  return {
    email: userRes.data.user.email ?? "(no email)",
    subscription: subRes.data
      ? {
          status: subRes.data.status as string,
          current_period_end: subRes.data.current_period_end as
            | string
            | null,
          trial_end: subRes.data.trial_end as string | null,
        }
      : null,
    receipts,
    monthTotal,
  };
}

export default async function AdminCustomerDetailPage({ params }: PageProps) {
  const { userId } = await params;
  const customer = await loadCustomer(userId);
  if (!customer) notFound();

  const baseCurrency = customer.receipts[0]?.currency ?? "EUR";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" />
          All customers
        </Link>
        <h1 className="text-lg font-semibold mt-2">{customer.email}</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          {userId}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Subscription
            </p>
            <p className="font-semibold text-sm mt-1 capitalize">
              {customer.subscription?.status ?? "none"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total receipts
            </p>
            <p className="font-semibold text-sm mt-1">
              {customer.receipts.length}
              {customer.receipts.length === RECEIPT_FETCH_LIMIT ? "+" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              This month
            </p>
            <p className="font-semibold text-sm mt-1 tabular-nums">
              {formatAmount(customer.monthTotal, baseCurrency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <PasteForm userId={userId} />

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent receipts
        </h2>
        {customer.receipts.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No receipts yet — paste the first one above.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {customer.receipts.map((r) => (
              <ReceiptListItem key={r.id} receipt={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
