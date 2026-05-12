// Resend Inbound webhook → canonical digital_receipts row.
//
// Flow:
//   1. Verify Svix-style signature against RESEND_INBOUND_WEBHOOK_SECRET.
//   2. Parse the `email.received` payload (defensive — Resend's
//      shape has fields nested under .data and `to`/`from` may be a
//      string or `{ address, name }` objects).
//   3. Resolve the user_id from the `receipts+<hash>@in.unreceipt.com`
//      To: address. Unknown alias → 404 with a generic body (don't leak
//      which hashes are valid).
//   4. Compute intake_ref = Message-Id header || sha256(raw .eml).
//   5. Upsert by intake_ref. Existing row → 200 idempotent.
//   6. Upload raw .eml to receipt-originals/{user_id}/{receipt_id}.eml.
//   7. Run parser. Parser throw → fall back to pending_review (row still
//      inserted with nullable canonical fields so the user can complete).
//   8. Insert row.
//
// Provider needs a 2xx to stop retrying. We return 200 even on logical
// no-ops (unknown alias still returns 404 — Resend will dead-letter
// those, which is correct). Signature failures return 401 so the
// provider's retry logic kicks in (real signing issues are usually
// transient config drift on the provider side).

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/webhook-signature";
import {
  findUserByAliasHash,
  parseAliasFromTo,
} from "@/lib/email-alias";
import { parseReceipt } from "@/lib/receipts/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Parser can take a few seconds for the LLM extract path (step 5+). Give
// it room before Resend's own retry kicks in.
export const maxDuration = 30;

type AddressLike = string | { address?: unknown; name?: unknown };

type ResendInboundPayload = {
  type?: string;
  data?: {
    from?: AddressLike;
    to?: AddressLike | AddressLike[];
    subject?: string;
    text?: string | null;
    html?: string | null;
    headers?: Record<string, string | string[] | undefined>;
    // Base64-encoded raw .eml. Resend Inbound exposes this as `raw`.
    raw?: string;
  };
};

function pickAddress(addr: AddressLike | AddressLike[] | undefined): string {
  if (!addr) return "";
  if (Array.isArray(addr)) {
    for (const a of addr) {
      const picked = pickAddress(a);
      if (picked) return picked;
    }
    return "";
  }
  if (typeof addr === "string") return addr;
  if (addr && typeof addr === "object" && typeof addr.address === "string") {
    return addr.address;
  }
  return "";
}

function pickHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | null {
  if (!headers) return null;
  // Headers can be case-mixed depending on provider normalization.
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== lower) continue;
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return null;
}

function genericNotFound() {
  // Same body whether the alias was malformed or simply not registered —
  // an attacker spraying aliases should not be able to enumerate which
  // ones are live. Log internally for ops.
  return NextResponse.json({ error: "not deliverable" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[intake/email] RESEND_INBOUND_WEBHOOK_SECRET missing");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  // Read the raw body BEFORE any JSON parse — signature is over the bytes.
  const rawBody = await request.text();

  const verify = verifyWebhookSignature({
    body: rawBody,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    secret,
  });
  if (!verify.ok) {
    // 401 — provider retries on auth failures, which is what we want
    // for transient config drift. Real attackers also get a 401 and
    // a generic body.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody) as ResendInboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Resend uses `email.received` as the inbound event type. Other event
  // types (delivery, bounce, etc.) come from outbound and should never
  // hit this endpoint, but ack them so the provider stops retrying.
  if (payload.type && payload.type !== "email.received") {
    return NextResponse.json({ ignored: true });
  }

  const data = payload.data ?? {};
  const toAddr = pickAddress(data.to);
  const fromAddr = pickAddress(data.from);

  const aliasHash = parseAliasFromTo(toAddr);
  if (!aliasHash) {
    console.warn("[intake/email] unparseable To:", { to: toAddr, from: fromAddr });
    return genericNotFound();
  }

  const owner = await findUserByAliasHash(aliasHash);
  if (!owner) {
    console.warn("[intake/email] unknown alias hash", { aliasHash, from: fromAddr });
    return genericNotFound();
  }
  const userId = owner.user_id;

  // intake_ref: prefer Message-Id (provider-stable identity that survives
  // re-forwarding by the user). Fall back to sha256 of the raw .eml so we
  // still get idempotency on senders that strip Message-Id.
  const messageId = pickHeader(data.headers, "Message-Id");
  const rawEml = typeof data.raw === "string" ? data.raw : "";
  let intakeRef: string | null = messageId && messageId.trim().length > 0 ? messageId.trim() : null;
  if (!intakeRef) {
    if (rawEml.length > 0) {
      intakeRef = `sha256:${createHash("sha256").update(rawEml).digest("hex")}`;
    } else {
      // No Message-Id and no raw payload — fall back to a hash of the
      // visible fields so re-deliveries of the same body still dedupe.
      intakeRef = `sha256:${createHash("sha256")
        .update(JSON.stringify({ toAddr, fromAddr, subject: data.subject, text: data.text }))
        .digest("hex")}`;
    }
  }

  const supabase = getSupabaseAdmin();

  // Idempotency: existing row → 200 with its id, no side effects.
  const { data: existing, error: existingError } = await supabase
    .from("receipts")
    .select("id")
    .eq("intake_ref", intakeRef)
    .maybeSingle();
  if (existingError) {
    console.error("[intake/email] intake_ref lookup failed", existingError);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
  }

  // Parse (best-effort). Throw → pending_review.
  let parseResult: Awaited<ReturnType<typeof parseReceipt>>;
  try {
    parseResult = await parseReceipt({
      kind: "email",
      raw: {
        from: fromAddr,
        to: toAddr,
        subject: typeof data.subject === "string" ? data.subject : "",
        text: typeof data.text === "string" ? data.text : null,
        html: typeof data.html === "string" ? data.html : null,
      },
    });
  } catch (err) {
    console.error("[intake/email] parser threw", err);
    parseResult = { status: "pending_review" };
  }

  // Generate the receipt id up front so the storage path and the row both
  // reference the same uuid. If the insert later loses an idempotency race
  // (23505 on intake_ref), we best-effort delete the storage object.
  const receiptId = crypto.randomUUID();
  const storagePath = `${userId}/${receiptId}.eml`;

  if (rawEml.length > 0) {
    const buf = Buffer.from(rawEml, "base64");
    const { error: uploadError } = await supabase.storage
      .from("receipt-originals")
      .upload(storagePath, buf, {
        cacheControl: "3600",
        upsert: false,
        contentType: "message/rfc822",
      });
    if (uploadError) {
      console.error("[intake/email] eml upload failed", uploadError);
      // Soft-fail — keep going, the row is the user-visible artifact.
      // We just won't have an "Original source" toggle for this one.
    }
  }

  const baseFields = {
    id: receiptId,
    user_id: userId,
    source: "email" as const,
    intake_ref: intakeRef,
    original_source_url: rawEml.length > 0 ? storagePath : null,
    original_source_kind: rawEml.length > 0 ? ("eml" as const) : null,
    notes: typeof data.subject === "string" && data.subject.length > 0 ? `Subject: ${data.subject}` : null,
  };

  const rowToInsert =
    parseResult.status === "ok"
      ? {
          ...baseFields,
          merchant_name: parseResult.fields.merchant_name,
          purchased_at: parseResult.fields.purchased_at,
          receipt_date: parseResult.fields.purchased_at.slice(0, 10),
          total: parseResult.fields.total,
          currency: parseResult.fields.currency,
          subtotal: parseResult.fields.subtotal ?? null,
          tax_amount: parseResult.fields.tax_amount ?? null,
          tax_rate: parseResult.fields.tax_rate ?? null,
          payment_method: parseResult.fields.payment_method ?? null,
          card_last_four: parseResult.fields.card_last_four ?? null,
          category: parseResult.fields.category ?? "other",
          parse_confidence: parseResult.fields.parse_confidence,
          notes:
            parseResult.fields.notes && parseResult.fields.notes.length > 0
              ? parseResult.fields.notes
              : baseFields.notes,
        }
      : baseFields;

  const { data: inserted, error: insertError } = await supabase
    .from("receipts")
    .insert(rowToInsert)
    .select("id")
    .single();

  if (insertError || !inserted) {
    // 23505 = unique_violation on intake_ref — concurrent retry won the
    // race. Best-effort delete the orphan blob and return the existing
    // row's id so the provider stops retrying.
    if (insertError && (insertError as { code?: string }).code === "23505") {
      if (rawEml.length > 0) {
        await supabase.storage
          .from("receipt-originals")
          .remove([storagePath])
          .catch(() => {});
      }
      const { data: winner } = await supabase
        .from("receipts")
        .select("id")
        .eq("intake_ref", intakeRef)
        .maybeSingle();
      if (winner) {
        return NextResponse.json({ ok: true, id: winner.id, duplicate: true });
      }
    }

    console.error("[intake/email] insert failed", insertError);
    if (rawEml.length > 0) {
      await supabase.storage
        .from("receipt-originals")
        .remove([storagePath])
        .catch(() => {});
    }
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
