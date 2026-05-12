// Receipt PDF download gate — returns 409 when the receipt is
// `pending_review` so the customer is forced to complete it on /app
// before they can hand the artifact to finance/VAT.
//
// PDF rendering itself is a later concern (step 11+). For now the
// verified branch returns a plain-text receipt summary with a
// Content-Disposition: attachment so the download still functions
// end-to-end. The 409 contract is the contract this step needs to lock.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getServerUser } from "@/lib/supabase-server";
import {
  missingRequiredFields,
  type RequiredField,
} from "@/lib/receipts/status";
import { formatAmount, formatDate } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserScopedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        /* read-only — no session refresh path on a GET download */
      },
    },
  });
}

export async function GET(
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
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const receipt = data as Receipt;

  if (receipt.status === "pending_review") {
    const missing: RequiredField[] = missingRequiredFields({
      merchant_name: receipt.merchant_name,
      purchased_at: receipt.purchased_at,
      receipt_date: receipt.receipt_date,
      total: receipt.total,
    });
    return NextResponse.json(
      { error: "review_required", missing_fields: missing },
      { status: 409 }
    );
  }

  const lines = [
    "UnReceipt — Digital Receipt",
    "============================",
    `Merchant:    ${receipt.merchant_name ?? "—"}`,
    `Date:        ${formatDate(receipt.purchased_at ?? receipt.receipt_date)}`,
    `Total:       ${formatAmount(receipt.total, receipt.currency)}`,
    receipt.tax_amount != null
      ? `VAT:         ${formatAmount(receipt.tax_amount, receipt.currency)}`
      : null,
    receipt.payment_method ? `Payment:     ${receipt.payment_method}` : null,
    receipt.verification_code
      ? `Verification: ${receipt.verification_code}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return new NextResponse(lines, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="receipt-${id}.txt"`,
    },
  });
}
