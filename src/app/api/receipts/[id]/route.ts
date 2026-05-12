// Customer-side receipt edit endpoint — used by the "Complete this
// receipt" flow on pending_review rows. PATCH validates the partial
// payload, merges it onto the existing row, and re-runs
// computeReceiptStatus so a previously pending row flips to 'verified'
// the moment the missing fields are filled.
//
// Anon-key client → RLS enforces user ownership; service-role is not
// required here.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import { computeReceiptStatus } from "@/lib/receipts/status";
import type { Receipt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  merchant: z.string().trim().min(1).max(200).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
  currency: z.enum(CURRENCY_OPTIONS).optional(),
  receipt_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "receipt_date must be YYYY-MM-DD")
    .optional(),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

async function getUserScopedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context */
        }
      },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(raw);
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

  const supabase = await getUserScopedClient();

  // Read the existing row first — we need its current values to compute
  // the merged status (required-field check on the *result* of the patch,
  // not just on the patch payload).
  const { data: existing, error: readError } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (!existing) {
    // RLS hides rows owned by other users, so a miss is correctly 404
    // from the caller's perspective.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const existingRow = existing as Receipt;
  const patch = parsed.data;

  // Build the update payload + the prospective post-patch view for the
  // status computation. Touching `receipt_date` also pins `purchased_at`
  // to noon UTC of that date — matches the convention from /api/capture.
  const update: Record<string, unknown> = {};
  const merged: Parameters<typeof computeReceiptStatus>[0] = {
    merchant_name: existingRow.merchant_name,
    purchased_at: existingRow.purchased_at,
    receipt_date: existingRow.receipt_date,
    total: existingRow.total,
    parse_confidence: existingRow.parse_confidence,
  };

  if (patch.merchant != null) {
    update.merchant_name = patch.merchant.trim();
    merged.merchant_name = patch.merchant.trim();
  }
  if (patch.amount != null) {
    update.total = patch.amount;
    merged.total = patch.amount;
  }
  if (patch.currency != null) {
    update.currency = patch.currency;
  }
  if (patch.receipt_date != null) {
    update.receipt_date = patch.receipt_date;
    const purchasedAt = `${patch.receipt_date}T12:00:00.000Z`;
    update.purchased_at = purchasedAt;
    merged.purchased_at = purchasedAt;
    merged.receipt_date = patch.receipt_date;
  }
  if (patch.category != null) {
    update.category = patch.category;
  }
  if (patch.notes !== undefined) {
    update.notes = patch.notes?.trim() ? patch.notes.trim() : null;
  }

  update.status = computeReceiptStatus(merged);

  const { error: updateError } = await supabase
    .from("receipts")
    .update(update)
    .eq("id", id);

  if (updateError) {
    console.error("[/api/receipts/PATCH] update failed", updateError);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: update.status });
}
