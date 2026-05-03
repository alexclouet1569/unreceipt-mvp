import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AdminAuthError, requireAdmin } from "@/lib/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Field length caps prevent abuse / pathological pasted-in inputs from
// blowing up the row size. Tax rate is capped at 100%; amounts at 1m
// (the founder is unlikely to paste a million-EUR receipt by hand —
// catches typos before they hit the dashboard).
const AdminReceiptSchema = z.object({
  user_id: z.string().uuid(),
  merchant: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(1_000_000),
  currency: z.enum(CURRENCY_OPTIONS),
  // ISO YYYY-MM-DD — what <input type="date"> emits.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
  tax_amount: z.number().nonnegative().max(1_000_000).optional(),
  tax_rate: z.number().nonnegative().max(100).optional(),
  payment_method: z.string().trim().max(100).optional(),
  receipt_number: z.string().trim().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = AdminReceiptSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("receipts").insert({
    user_id: data.user_id,
    merchant_name: data.merchant,
    category: data.category,
    currency: data.currency,
    total: data.amount,
    tax_amount: data.tax_amount ?? null,
    tax_rate: data.tax_rate ?? null,
    receipt_date: data.date,
    payment_method: data.payment_method ?? null,
    receipt_number: data.receipt_number ?? null,
    notes: data.notes ?? null,
    source: "forwarded",
    is_verified: true,
  });

  if (error) {
    console.error("[admin/receipts] insert failed", error);
    return NextResponse.json(
      { error: "Failed to save receipt" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
