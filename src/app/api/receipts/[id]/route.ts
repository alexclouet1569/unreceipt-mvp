// Customer-side receipt endpoint.
//
// PATCH — "Complete this receipt" on pending_review rows and "Edit" on
// any row. Validates the partial payload, merges it onto the existing row,
// and re-runs computeReceiptStatus so a pending row flips to 'verified' the
// moment the missing fields are filled. Changes to factual fields are
// recorded (edited_at / edited_fields / edit_history, see
// src/lib/receipts/edits.ts) so the detail view and the PDF can say
// "Edited by you". The stored original file is never touched.
//
// DELETE — removes the row and every stored file behind it (the photo in
// `receipts`, the forwarded .eml or PDF in `receipt-originals`).
//
// Rows are read through the anon-key client, so RLS enforces ownership.
// Updates go through the service role, scoped to the user: users have no
// direct INSERT/UPDATE grant on receipts, so the trust fields (status,
// intake_ref, …) can only be set by server code. Storage deletes also use
// the service role (`receipt-originals` has no user DELETE policy), on
// paths checked with isOwnedStoragePath first.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import { computeReceiptStatus } from "@/lib/receipts/status";
import { isOwnedStoragePath } from "@/lib/receipts/storage-path";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordReceiptUsage, usageSource } from "@/lib/usage";
import { editMarker } from "@/lib/receipts/edits";
import {
  BuyerAddressSchema,
  BuyerNameSchema,
  MAX_AMOUNT,
  PaymentMethodSchema,
  SellerIdSchema,
  VatBreakdownSchema,
  ReceiptItemsSchema,
  TaxAmountSchema,
  TaxRateSchema,
  taxExceedsTotal,
} from "@/lib/receipts/receipt-fields";
import type { Receipt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// null clears an optional field (VAT, payment method, items); omitted
// leaves it as it is.
const PatchSchema = z.object({
  merchant: z.string().trim().min(1).max(200).optional(),
  amount: z.number().positive().max(MAX_AMOUNT).optional(),
  currency: z.enum(CURRENCY_OPTIONS).optional(),
  receipt_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "receipt_date must be YYYY-MM-DD")
    .optional(),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]]).optional(),
  notes: z.string().max(2000).nullable().optional(),
  tax_amount: TaxAmountSchema.nullable().optional(),
  tax_rate: TaxRateSchema.nullable().optional(),
  payment_method: PaymentMethodSchema.nullable().optional(),
  items: ReceiptItemsSchema.nullable().optional(),
  merchant_vat_number: SellerIdSchema.nullable().optional(),
  merchant_org_number: SellerIdSchema.nullable().optional(),
  buyer_name: BuyerNameSchema.nullable().optional(),
  buyer_address: BuyerAddressSchema.nullable().optional(),
  vat_breakdown: VatBreakdownSchema.nullable().optional(),
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
    // A person is now saving these fields, which is the review the low
    // confidence asked for — so it no longer holds the row in
    // pending_review. The stored parse_confidence is left as-is.
    parse_confidence: null,
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

  if (patch.tax_amount !== undefined) update.tax_amount = patch.tax_amount;
  if (patch.tax_rate !== undefined) update.tax_rate = patch.tax_rate;
  if (patch.payment_method !== undefined) {
    update.payment_method = patch.payment_method;
  }
  if (patch.items !== undefined) {
    update.items = patch.items && patch.items.length > 0 ? patch.items : null;
  }
  for (const key of [
    "merchant_vat_number",
    "merchant_org_number",
    "buyer_name",
    "buyer_address",
  ] as const) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }
  if (patch.vat_breakdown !== undefined) {
    update.vat_breakdown =
      patch.vat_breakdown && patch.vat_breakdown.length > 0 ? patch.vat_breakdown : null;
  } else if (
    (patch.tax_amount !== undefined || patch.tax_rate !== undefined) &&
    existingRow.vat_breakdown != null
  ) {
    // The edit form has no per-rate fields: a corrected VAT amount or rate
    // replaces the breakdown that was read, so the two can't disagree.
    update.vat_breakdown = null;
  }

  // VAT can't exceed the total — checked on the result, since the patch may
  // change either one.
  const taxAfter =
    "tax_amount" in update ? (update.tax_amount as number | null) : existingRow.tax_amount;
  if (taxExceedsTotal(taxAfter, merged.total)) {
    return NextResponse.json(
      {
        error: "validation failed",
        issues: [{ path: "tax_amount", message: "VAT can't be more than the total" }],
      },
      { status: 400 }
    );
  }

  update.status = computeReceiptStatus(merged);
  Object.assign(update, editMarker(existingRow, update, new Date(), user.id));

  // The row was read under RLS above, so it belongs to this user. The write
  // itself goes through the service role: users have no direct UPDATE on
  // receipts (status and the other trust fields must only be set here).
  const { error: updateError } = await getSupabaseAdmin()
    .from("receipts")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[/api/receipts/PATCH] update failed", updateError);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  // Confirming a receipt that was waiting for review is when it counts
  // toward the plan (forwarded emails are only counted once confirmed).
  // Idempotent: receipts already counted at capture are a no-op.
  if (update.status === "verified") {
    await recordReceiptUsage({
      userId: user.id,
      receiptId: id,
      source: usageSource(existingRow.source),
    });
  }

  return NextResponse.json({ ok: true, status: update.status });
}

export async function DELETE(
  _request: NextRequest,
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

  const supabase = await getUserScopedClient();
  const { data: row, error: readError } = await supabase
    .from("receipts")
    .select("id, image_url, original_source_url")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[/api/receipts/DELETE] lookup failed", readError);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Files first: if storage fails, the row is still there and the user
  // can retry, instead of the files being orphaned with no row pointing
  // at them.
  const removals: Array<{ bucket: "receipts" | "receipt-originals"; path: string }> = [];
  if (row.image_url && isOwnedStoragePath(row.image_url, user.id)) {
    removals.push({ bucket: "receipts", path: row.image_url });
  }
  if (
    row.original_source_url &&
    isOwnedStoragePath(row.original_source_url, user.id)
  ) {
    removals.push({ bucket: "receipt-originals", path: row.original_source_url });
  }

  const admin = getSupabaseAdmin();
  for (const { bucket, path } of removals) {
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (error) {
      console.error("[/api/receipts/DELETE] storage remove failed", {
        bucket,
        error,
      });
      return NextResponse.json({ error: "delete failed" }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase
    .from("receipts")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[/api/receipts/DELETE] row delete failed", deleteError);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
