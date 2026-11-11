// SERVER-ONLY. The earliest purchase date on a user's receipts, so an
// export can reach every month back to it (Settings and the iPhone app).

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function loadFirstReceiptDate(userId: string): Promise<string | null> {
  // Older rows may only have receipt_date; take the earlier of both columns.
  const earliest = (column: "purchased_at" | "receipt_date") =>
    getSupabaseAdmin()
      .from("receipts")
      .select(column)
      .eq("user_id", userId)
      .not(column, "is", null)
      .order(column, { ascending: true })
      .limit(1)
      .maybeSingle();
  const [a, b] = await Promise.all([earliest("purchased_at"), earliest("receipt_date")]);
  const dates = [
    (a.data as { purchased_at?: string } | null)?.purchased_at,
    (b.data as { receipt_date?: string } | null)?.receipt_date,
  ].filter((d): d is string => typeof d === "string" && !Number.isNaN(Date.parse(d)));
  if (dates.length === 0) return null;
  return dates.reduce((min, d) => (Date.parse(d) < Date.parse(min) ? d : min));
}
