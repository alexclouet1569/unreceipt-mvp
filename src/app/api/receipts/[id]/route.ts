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
// PATCH reads the row through loadReceiptForActor() (owner, or staff of the
// accounting firm linked to the receipt's company) and writes with the
// service role scoped to the row's owner: users have no direct
// INSERT/UPDATE grant on receipts, so the trust fields (status, intake_ref,
// …) can only be set by server code. DELETE stays owner-only: it reads
// through the anon-key client, so RLS enforces ownership. Storage deletes
// use the service role (`receipt-originals` has no user DELETE policy), on
// paths checked with isOwnedStoragePath first.

import { isScanPath } from "@/lib/receipts/scans";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { maskCardNumbers } from "@/lib/receipts/card-numbers";
import { getServerUser, getUserSupabase } from "@/lib/supabase-server";
import { CATEGORY_KEYS, CURRENCY_OPTIONS } from "@/lib/receipt-format";
import { computeReceiptStatus } from "@/lib/receipts/status";
import { isOwnedStoragePath } from "@/lib/receipts/storage-path";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordReceiptUsage, usageSource } from "@/lib/usage";
import { editMarker } from "@/lib/receipts/edits";
import { loadReceiptForActor, ReceiptAccessError } from "@/lib/receipts/access";
import { vatLinesConsistent } from "@/lib/bookkeeping/vat-lines";
import {
  MAX_AMOUNT,
  OrgNumberSchema,
  PaymentMethodSchema,
  ReceiptItemsSchema,
  TaxAmountSchema,
  TaxRateSchema,
  VatLinesSchema,
  VatNumberSchema,
  taxExceedsTotal,
} from "@/lib/receipts/receipt-fields";
import type { Receipt } from "@/lib/types";
import { homeCurrencyOf, round2 } from "@/lib/fx";
import { ownerMayDelete, ownerMayEdit, statusAfterEdit } from "@/lib/team/rules";
import { logApproval } from "@/lib/team/decisions";
import { getEmployment } from "@/lib/team/membership";

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
  // The card's last four digits; null removes a misread.
  card_last_four: z.string().trim().regex(/^\d{4}$/, "Card digits must be 4 digits").nullable().optional(),
  items: ReceiptItemsSchema.nullable().optional(),
  seller_org_number: OrgNumberSchema.nullable().optional(),
  merchant_vat_number: VatNumberSchema.nullable().optional(),
  vat_lines: VatLinesSchema.nullable().optional(),
  // The firm's bookkeeping account for this receipt (overrides the
  // category suggestion in the export).
  bas_account: z.string().trim().regex(/^\d{4}$/, "A BAS account has 4 digits").nullable().optional(),
  // The amount in the organisation's home currency, typed from the bank
  // statement for a foreign receipt (fx_source 'manual'). null goes back
  // to the ECB rate.
  home_total: z.number().positive().max(MAX_AMOUNT).nullable().optional(),
  // An employee's receipt (2026-11-15): their own money, to pay back, or
  // the company's (a company card).
  paid_by: z.enum(["employee", "company"]).optional(),
});

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

  // Read the existing row first — we need its current values to compute
  // the merged status (required-field check on the *result* of the patch,
  // not just on the patch payload). Owner or linked firm staff only.
  let access;
  try {
    access = await loadReceiptForActor(user, id);
  } catch (err) {
    if (err instanceof ReceiptAccessError) {
      return NextResponse.json({ error: "lookup failed" }, { status: 500 });
    }
    throw err;
  }
  if (!access) {
    // A row the caller may not see is a miss, so ids can't be probed.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const existingRow: Receipt = access.receipt;
  const patch = parsed.data;

  // An approver looks and decides (POST /api/receipts/[id]/decision), never
  // edits a colleague's receipt; a rejected receipt stays as decided.
  if (access.via === "approver") {
    return NextResponse.json({ error: "approver_cannot_edit" }, { status: 403 });
  }
  if (access.via === "owner" && !ownerMayEdit(existingRow.approval_status)) {
    return NextResponse.json({ error: "rejected" }, { status: 409 });
  }
  if (access.via === "owner" && existingRow.approval_status) {
    const employment = await getEmployment(user.id).catch(() => undefined);
    if (employment === undefined) return NextResponse.json({ error: "lookup failed" }, { status: 500 });
    if (employment?.organizationId !== existingRow.organization_id) {
      return NextResponse.json({ error: "left_team" }, { status: 409 });
    }
  }

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
    update.notes = patch.notes?.trim() ? maskCardNumbers(patch.notes.trim()) : null;
  }

  if (patch.tax_amount !== undefined) update.tax_amount = patch.tax_amount;
  if (patch.tax_rate !== undefined) update.tax_rate = patch.tax_rate;
  if (patch.payment_method !== undefined) {
    update.payment_method = patch.payment_method;
  }
  if (patch.card_last_four !== undefined) update.card_last_four = patch.card_last_four;
  if (patch.items !== undefined) {
    update.items = patch.items && patch.items.length > 0 ? patch.items : null;
  }
  if (patch.seller_org_number !== undefined) update.seller_org_number = patch.seller_org_number;
  if (patch.merchant_vat_number !== undefined) update.merchant_vat_number = patch.merchant_vat_number;
  if (patch.vat_lines !== undefined) {
    update.vat_lines =
      patch.vat_lines && patch.vat_lines.length > 0
        ? patch.vat_lines.map((l) => ({ rate: l.rate, net: l.net ?? null, vat: l.vat }))
        : null;
  }
  if (patch.bas_account !== undefined) update.bas_account = patch.bas_account;
  // Only on a receipt that goes through approval, and only by its owner.
  if (patch.paid_by !== undefined && existingRow.approval_status && access.via === "owner") {
    update.paid_by = patch.paid_by;
  }

  // Home-currency amount (src/lib/fx.ts). A typed amount is kept as
  // 'manual'; a change of amount, currency or date drops any conversion so
  // the next read converts again at the right day's rate.
  const clearFx = { home_currency: null, home_total: null, fx_rate: null, fx_date: null, fx_source: null };
  if (patch.home_total != null) {
    const home = await homeCurrencyOf(existingRow.organization_id);
    if ((patch.currency ?? existingRow.currency) === home) {
      return NextResponse.json(
        {
          error: "validation failed",
          issues: [{ path: "home_total", message: "This receipt is already in the company's currency" }],
        },
        { status: 400 }
      );
    }
    const amount = round2(patch.home_total);
    update.home_currency = home;
    update.home_total = amount;
    update.fx_source = "manual";
    update.fx_date = null;
    update.fx_rate = merged.total ? Math.round((amount / merged.total) * 1e8) / 1e8 : null;
  } else if (
    patch.home_total === null ||
    ("total" in update && update.total !== existingRow.total) ||
    ("currency" in update && update.currency !== existingRow.currency) ||
    ("purchased_at" in update && update.purchased_at !== existingRow.purchased_at)
  ) {
    Object.assign(update, clearFx);
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

  // A split must add up to the VAT amount it belongs to (both after the patch).
  const linesAfter =
    "vat_lines" in update ? (update.vat_lines as Array<{ vat: number }> | null) : existingRow.vat_lines;
  if (linesAfter && linesAfter.length > 0 && !vatLinesConsistent(linesAfter, taxAfter)) {
    return NextResponse.json(
      {
        error: "validation failed",
        issues: [{ path: "vat_lines", message: "VAT per rate must add up to the VAT amount" }],
      },
      { status: 400 }
    );
  }

  // Choosing the bookkeeping account (the firm's BAS field) is not a review
  // of the receipt: it leaves the status as it is, so it can neither
  // confirm a receipt nobody checked (which would show a mailbox receipt to
  // the firm and bill it) nor send a confirmed one back. An empty patch is
  // not this case: it is "Confirm receipt" with nothing changed.
  const patchKeys = Object.keys(patch);
  const bookkeepingOnly = patchKeys.length > 0 && patchKeys.every((k) => k === "bas_account");
  if (!bookkeepingOnly) update.status = computeReceiptStatus(merged);

  // The employee changed what was approved: it goes back for approval
  // (src/lib/team/rules.ts). Compared with the stored values, so saving
  // the same amount again doesn't ask twice.
  const existingValues = existingRow as unknown as Record<string, unknown>;
  const changed = Object.keys(update).filter((k) => update[k] !== existingValues[k]);
  const reopened = access.via === "owner" ? statusAfterEdit(existingRow.approval_status, changed) : null;
  if (reopened) {
    update.approval_status = reopened;
    update.submitted_at = new Date().toISOString();
    update.decided_at = null;
    update.decided_by = null;
  }
  Object.assign(update, editMarker(existingRow, update, new Date(), user.id));

  // loadReceiptForActor() proved the caller may edit this row. The write
  // goes through the service role, scoped to the row's owner (never the
  // actor: for firm staff they differ): users have no direct UPDATE on
  // receipts (status and the other trust fields must only be set here).
  // Compare-and-set on the approval state that was checked above: an
  // approval landing meanwhile can't end up approving an amount nobody saw.
  let write = getSupabaseAdmin()
    .from("receipts")
    .update(update)
    .eq("id", id)
    .eq("user_id", existingRow.user_id);
  write = existingRow.approval_status
    ? write.eq("approval_status", existingRow.approval_status)
    : write.is("approval_status", null);
  const { data: written, error: updateError } = await write.select("id");

  if (updateError) {
    console.error("[/api/receipts/PATCH] update failed", updateError);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  if (!written || written.length === 0) {
    return NextResponse.json({ error: "changed" }, { status: 409 });
  }
  if (reopened) await logApproval(existingRow, user.id, "reopened", null);

  // Confirming a receipt that was waiting for review is when it counts
  // toward the plan (forwarded emails are only counted once confirmed).
  // Idempotent: receipts already counted at capture are a no-op.
  // Always the client's usage, whoever completed the receipt.
  if (update.status === "verified") {
    await recordReceiptUsage({
      userId: existingRow.user_id,
      receiptId: id,
      source: usageSource(existingRow.source),
    });
  }

  return NextResponse.json({ ok: true, status: update.status ?? existingRow.status });
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

  const supabase = await getUserSupabase();
  const { data: row, error: readError } = await supabase
    .from("receipts")
    .select("id, image_url, original_source_url, approval_status")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[/api/receipts/DELETE] lookup failed", readError);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // An employee's receipt waiting for a decision, or approved, is the
  // company's record now (src/lib/team/rules.ts).
  if (!ownerMayDelete(row.approval_status as Receipt["approval_status"])) {
    return NextResponse.json({ error: "in_approval" }, { status: 409 });
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
    // A scanned PDF is the original of every page receipt made from it:
    // it goes with the last of them (src/lib/receipts/scans.ts).
    let shared = false;
    if (isScanPath(row.original_source_url)) {
      const { count, error: countError } = await getSupabaseAdmin()
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("original_source_url", row.original_source_url)
        .neq("id", id);
      if (countError) {
        console.error("[/api/receipts/DELETE] scan share check failed", countError.code);
        return NextResponse.json({ error: "delete failed" }, { status: 500 });
      }
      shared = (count ?? 0) > 0;
    }
    if (!shared) removals.push({ bucket: "receipt-originals", path: row.original_source_url });
  }
  // An email whose attachment is the original keeps the message itself
  // next to it as <id>.eml; a missing file is not an error for remove().
  const sibling = `${user.id}/${id}.eml`;
  if (
    row.original_source_url &&
    row.original_source_url !== sibling &&
    row.original_source_url.startsWith(`${user.id}/${id}.`)
  ) {
    removals.push({ bucket: "receipt-originals", path: sibling });
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
