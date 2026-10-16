// Resend Inbound webhook → canonical digital_receipts row.
//
// Flow:
//   1. Verify Svix-style signature against RESEND_INBOUND_WEBHOOK_SECRET.
//   2. Parse the `email.received` payload (defensive — Resend's
//      shape has fields nested under .data and `to`/`from` may be a
//      string or `{ address, name }` objects).
//   3. Resolve the user_id from the `receipts+<hash>@in.unreceipt.com`
//      address (To:, received_for or Cc:). Unknown alias → 404 with a
//      generic body (don't leak which hashes are valid).
//   3b. Load the body, headers and original .eml from Resend's Receiving
//      API by email_id — the webhook itself carries metadata only.
//   3c. Gmail's forwarding confirmation email → keep its code for the
//      setup guide and stop (it isn't a receipt).
//   4. Compute intake_ref = Message-Id header || sha256(raw .eml).
//   5. Upsert by (user_id, intake_ref). Existing row → 200 idempotent.
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

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordReceiptUsage } from "@/lib/usage";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { verifyWebhookSignature } from "@/lib/webhook-signature";
import {
  findUserByAliasHash,
  parseAliasFromTo,
} from "@/lib/email-alias";
import { parseReceipt } from "@/lib/receipts/parser";
import { computeReceiptStatus } from "@/lib/receipts/status";
import { fetchReceivedEmail, type ReceivedEmailContent } from "@/lib/resend-inbound";
import { parseForwardingConfirmation } from "@/lib/forwarding-confirmation";
import { buildForwardingAddress } from "@/lib/email-alias";
import { rawHeaderValues, recipientOwnership, type RecipientOwnership } from "@/lib/email-address";
import { loadOwnerAddresses } from "@/lib/owner-addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Parser can take a few seconds for the LLM extract path (step 5+). Give
// it room before Resend's own retry kicks in.
export const maxDuration = 30;

type AddressLike = string | { address?: unknown; name?: unknown };

type ResendInboundPayload = {
  type?: string;
  data?: {
    // Current Resend webhooks: metadata only. The body, headers and the
    // original .eml are fetched by email_id (lib/resend-inbound.ts).
    email_id?: string;
    message_id?: string;
    from?: AddressLike;
    to?: AddressLike | AddressLike[];
    cc?: AddressLike | AddressLike[];
    // The address the message was actually delivered for — differs from
    // `to` when the user set up an automatic forwarding rule.
    received_for?: AddressLike | AddressLike[];
    subject?: string;
    // Full-body shape, kept for payloads that carry the content inline.
    text?: string | null;
    html?: string | null;
    headers?: Record<string, string | string[] | undefined>;
    // Base64-encoded raw .eml.
    raw?: string;
  };
};

function allAddresses(...fields: Array<AddressLike | AddressLike[] | undefined>): string[] {
  return fields
    .flatMap((f) => (Array.isArray(f) ? f : f ? [f] : []))
    .map((a) => pickAddress(a))
    .filter((a) => a.length > 0);
}

// Inline body when the payload has one; otherwise load it from Resend.
async function loadEmailContent(
  data: NonNullable<ResendInboundPayload["data"]>
): Promise<ReceivedEmailContent | null> {
  const inline =
    typeof data.text === "string" ||
    typeof data.html === "string" ||
    typeof data.raw === "string";
  if (inline || typeof data.email_id !== "string") {
    return {
      text: typeof data.text === "string" ? data.text : null,
      html: typeof data.html === "string" ? data.html : null,
      headers: data.headers ?? {},
      messageId: typeof data.message_id === "string" ? data.message_id : null,
      rawEml: typeof data.raw === "string" ? Buffer.from(data.raw, "base64") : null,
      // An inline payload carries no verdict we can trust.
      authentication: null,
    };
  }
  return fetchReceivedEmail(data.email_id);
}

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


// A header from the Receiving API's headers object, as a list of values.
function headerList(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string[] {
  const values: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== name) continue;
    if (typeof v === "string") values.push(v);
    else if (Array.isArray(v)) values.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return values;
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
  const fromAddr = pickAddress(data.from);

  // The alias is usually in To:, but an automatic forwarding rule keeps the
  // original recipient there and puts ours in received_for (or Cc:).
  const recipients = allAddresses(data.to, data.received_for, data.cc);
  let toAddr = recipients[0] ?? "";
  let aliasHash: string | null = null;
  for (const candidate of recipients) {
    aliasHash = parseAliasFromTo(candidate);
    if (aliasHash) {
      toAddr = candidate;
      break;
    }
  }
  if (!aliasHash) {
    // No addresses in logs: they're personal data, and the recipient
    // count is enough to debug routing.
    console.warn("[intake/email] no forwarding alias among recipients", {
      recipientCount: recipients.length,
    });
    return genericNotFound();
  }

  const owner = await findUserByAliasHash(aliasHash);
  if (!owner) {
    console.warn("[intake/email] unknown alias hash", { aliasHash });
    return genericNotFound();
  }
  const userId = owner.user_id;

  // Per-alias daily cap, checked before loading the email or calling the
  // parser so a flood to a leaked alias stays cheap. 429 → Resend retries
  // later, so a real (very busy) inbox doesn't lose mail.
  const limited = await rateLimit("intakeEmail", aliasHash);
  if (!limited.ok) return rateLimitedResponse(limited.retryAfterSeconds);

  // Loaded only after the alias resolves, so spam to random addresses
  // costs no API call. A failed load → 502 so Resend retries the webhook.
  const content = await loadEmailContent(data);
  if (!content) {
    return NextResponse.json({ error: "email content unavailable" }, { status: 502 });
  }
  const supabase = getSupabaseAdmin();
  // Postgres text can't hold NUL; one in the subject failed the insert and
  // lost the email on every retry.
  // Capped too: real subjects are short, and long ones feed slow regexes.
  const subject =
    typeof data.subject === "string" ? data.subject.replace(/\u0000/g, "").slice(0, 500) : "";
  const text = content.text?.replace(/\u0000/g, "") ?? null;
  const html = content.html?.replace(/\u0000/g, "") ?? null;
  // Resend's own DMARC verdict: the From: domain is genuine.
  const dmarc = content.authentication?.dmarc ?? null;

  // Gmail's "confirm this forwarding address" email isn't a receipt: keep
  // its code for the setup guide and stop here. 500 on a failed write so
  // Resend retries; the user can't finish the Gmail setup without it.
  const confirmation = parseForwardingConfirmation({
    from: fromAddr,
    subject,
    text,
    dmarc,
  });
  if (confirmation) {
    const { error: confirmationError } = await supabase
      .from("email_forwarding_confirmations")
      .upsert(
        {
          user_id: userId,
          provider: confirmation.provider,
          code: confirmation.code,
          for_address: confirmation.forAddress,
          received_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (confirmationError) {
      console.error("[intake/email] forwarding confirmation save failed", confirmationError);
      Sentry.captureException(new Error("forwarding confirmation save failed"), {
        tags: { area: "intake-forwarding-confirmation" },
      });
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, forwardingConfirmation: true });
  }

  const rawEml = content.rawEml;
  const hasRaw = rawEml !== null && rawEml.length > 0;

  // intake_ref: prefer Message-Id (provider-stable identity that survives
  // re-forwarding by the user). Fall back to sha256 of the raw .eml so we
  // still get idempotency on senders that strip Message-Id.
  const messageId = content.messageId ?? pickHeader(content.headers, "Message-Id");
  let intakeRef: string | null = messageId && messageId.trim().length > 0 ? messageId.trim() : null;
  if (!intakeRef) {
    if (hasRaw) {
      intakeRef = `sha256:${createHash("sha256").update(rawEml).digest("hex")}`;
    } else {
      // No Message-Id and no raw payload — fall back to a hash of the
      // visible fields so re-deliveries of the same body still dedupe.
      intakeRef = `sha256:${createHash("sha256")
        .update(
          JSON.stringify({
            emailId: data.email_id,
            toAddr,
            fromAddr,
            subject: data.subject,
            text,
          })
        )
        .digest("hex")}`;
    }
  }

  // Idempotency: existing row → 200 with its id, no side effects. Scoped
  // to the user: Message-Id is sender-controlled, so a global key would let
  // one user's row swallow another user's copy of the same email.
  const { data: existing, error: existingError } = await supabase
    .from("receipts")
    .select("id")
    .eq("user_id", userId)
    .eq("intake_ref", intakeRef)
    .maybeSingle();
  if (existingError) {
    console.error("[intake/email] intake_ref lookup failed", existingError);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
  }

  // Who the email was originally sent to: the To: header of the message
  // itself (from the raw .eml, else the Receiving API's headers), never the
  // webhook's recipient list or the envelope that brought it here. Only
  // looked up for a DMARC-authenticated mail, the only kind a template can
  // trust.
  let recipient: RecipientOwnership = "none";
  if (dmarc === "pass") {
    const toHeaders = rawEml && hasRaw
      ? rawHeaderValues(rawEml.toString("utf8"), "to")
      : headerList(content.headers, "to");
    const owner = await loadOwnerAddresses(userId, buildForwardingAddress(aliasHash));
    recipient = recipientOwnership(toHeaders, owner);
  }

  // Parse (best-effort). Throw → pending_review.
  let parseResult: Awaited<ReturnType<typeof parseReceipt>>;
  try {
    parseResult = await parseReceipt({
      kind: "email",
      raw: {
        from: fromAddr,
        to: toAddr,
        subject,
        text,
        html,
        authenticated: dmarc === "pass",
        recipient,
      },
    });
  } catch (err) {
    console.error("[intake/email] parser threw", err);
    Sentry.captureException(err, { tags: { area: "intake-parse" } });
    parseResult = { status: "pending_review" };
  }

  // Generate the receipt id up front so the storage path and the row both
  // reference the same uuid. If the insert later loses an idempotency race
  // (23505 on intake_ref), we best-effort delete the storage object.
  const receiptId = crypto.randomUUID();
  const storagePath = `${userId}/${receiptId}.eml`;

  if (hasRaw) {
    const { error: uploadError } = await supabase.storage
      .from("receipt-originals")
      .upload(storagePath, rawEml, {
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
    original_source_url: hasRaw ? storagePath : null,
    original_source_kind: hasRaw ? ("eml" as const) : null,
    // Capped: a 100 KB subject was stored whole.
    notes: subject.length > 0 ? `Subject: ${subject.slice(0, 300)}` : null,
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
          items: parseResult.fields.items ?? null,
          parse_confidence: parseResult.fields.parse_confidence,
          status: computeReceiptStatus({
            merchant_name: parseResult.fields.merchant_name,
            purchased_at: parseResult.fields.purchased_at,
            total: parseResult.fields.total,
            parse_confidence: parseResult.fields.parse_confidence,
          }),
          notes:
            parseResult.fields.notes && parseResult.fields.notes.length > 0
              ? parseResult.fields.notes
              : baseFields.notes,
        }
      : { ...baseFields, status: "pending_review" as const };

  const { data: inserted, error: insertError } = await supabase
    .from("receipts")
    .insert(rowToInsert)
    .select("id")
    .single();

  if (insertError || !inserted) {
    // 23505 = unique_violation on (user_id, intake_ref) — concurrent retry won the
    // race. Best-effort delete the orphan blob and return the existing
    // row's id so the provider stops retrying.
    if (insertError && (insertError as { code?: string }).code === "23505") {
      if (hasRaw) {
        await supabase.storage
          .from("receipt-originals")
          .remove([storagePath])
          .catch(() => {});
      }
      const { data: winner } = await supabase
        .from("receipts")
        .select("id")
        .eq("user_id", userId)
        .eq("intake_ref", intakeRef)
        .maybeSingle();
      if (winner) {
        return NextResponse.json({ ok: true, id: winner.id, duplicate: true });
      }
    }

    console.error("[intake/email] insert failed", insertError);
    Sentry.captureException(new Error("intake insert failed"), {
      tags: { area: "intake-insert" },
      extra: { code: (insertError as { code?: string } | null)?.code },
    });
    if (hasRaw) {
      await supabase.storage
        .from("receipt-originals")
        .remove([storagePath])
        .catch(() => {});
    }
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  // Anyone who knows an alias can email it, so an inbound email only
  // counts toward the plan once it's a verified receipt. Rows that land
  // in pending_review (spam, newsletters, unparseable mail) count when
  // the user confirms them (PATCH /api/receipts/[id]); deleting them
  // costs nothing.
  if (rowToInsert.status === "verified") {
    await recordReceiptUsage({ userId, receiptId: inserted.id, source: "email" });
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
