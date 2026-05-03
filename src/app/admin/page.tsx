import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatDate } from "@/lib/receipt-format";

export const dynamic = "force-dynamic";

type CustomerRow = {
  user_id: string;
  email: string;
  status: string;
  receipt_count: number;
  last_activity_iso: string | null;
};

// TODO(scale): At 50+ customers replace the per-user round trips below
// with a single SQL view — `customer_concierge_summary` joining
// auth.users + subscriptions + receipts aggregations. Fine for the
// 3-customer WOZ beta where the founder-facing latency is unnoticeable.
async function loadCustomers(): Promise<CustomerRow[]> {
  const supabase = getSupabaseAdmin();

  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("user_id, status")
    .in("status", ["active", "trialing"]);

  if (subsError) {
    console.error("[admin] subscriptions query failed", subsError);
    return [];
  }
  if (!subs || subs.length === 0) return [];

  const rows = await Promise.all(
    subs.map(async (sub) => {
      const userId = sub.user_id as string;
      const status = sub.status as string;

      const [userRes, receiptsRes] = await Promise.all([
        supabase.auth.admin.getUserById(userId),
        supabase
          .from("receipts")
          .select("created_at", { count: "exact", head: false })
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const email = userRes.data.user?.email ?? "(no email)";
      const receiptCount = receiptsRes.count ?? 0;
      const latest = receiptsRes.data?.[0] as
        | { created_at: string | null }
        | undefined;

      return {
        user_id: userId,
        email,
        status,
        receipt_count: receiptCount,
        last_activity_iso: latest?.created_at ?? null,
      } satisfies CustomerRow;
    })
  );

  // Most recently active first; brand-new customers (no receipts) sink.
  return rows.sort((a, b) => {
    const aT = a.last_activity_iso ? Date.parse(a.last_activity_iso) : 0;
    const bT = b.last_activity_iso ? Date.parse(b.last_activity_iso) : 0;
    return bT - aT;
  });
}

export default async function AdminCustomerListPage() {
  const customers = await loadCustomers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          {customers.length === 0
            ? "No active or trialing subscriptions yet."
            : `${customers.length} active or trialing customer${customers.length === 1 ? "" : "s"}, sorted by last activity.`}
        </p>
      </div>

      {customers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Once a customer signs up and pays via /subscribe, they&apos;ll
            appear here. Forwarded receipts can then be pasted from{" "}
            <span className="font-mono">/admin/[userId]</span>.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <Link
              key={c.user_id}
              href={`/admin/${c.user_id}`}
              className="block group"
            >
              <Card className="group-hover:border-primary/40 transition-colors">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">
                          {c.email}
                        </p>
                        <span
                          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                            c.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.receipt_count} receipt
                        {c.receipt_count === 1 ? "" : "s"}
                        {" · "}
                        {c.last_activity_iso
                          ? `last on ${formatDate(c.last_activity_iso)}`
                          : "no receipts yet"}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
