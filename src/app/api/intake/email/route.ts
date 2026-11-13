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
//   7b. An attached PDF or photo (the usual case for a forwarded invoice
//      or a photographed receipt) is read with Claude OCR instead of the
//      email text, unless a trusted template already read the mail. The
//      attachment is then stored as the original, byte for byte, next to
//      the .eml; its fields land in Review needed like any untrusted
//      extraction. When OCR read only part of it, what it read is kept and
//      the email text fills the gaps (./attachment-fields.ts).
//   8. Insert row. A failed upload of an original answers 500 before
//      anything is inserted, so Resend redelivers.
//
// Provider needs a 2xx to stop retrying. We return 200 even on logical
// no-ops (unknown alias still returns 404 — Resend will dead-letter
// those, which is correct; a failed alias lookup is a 503, retried). Signature failures return 401 so the
// provider's retry logic kicks in (real signing issues are usually
// transient config drift on the provider side).

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordReceiptUsage } from "@/lib/usage";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { verifyWebhookSignature } from "@/lib/webhook-signature";
import {
  AliasLookupError,
  findUserByAliasHash,
  parseAliasFromTo,
} from "@/lib/email-alias";
import { parseReceipt } from "@/lib/receipts/parser";
import { computeReceiptStatus } from "@/lib/receipts/status";
import { fetchReceivedEmail, type ReceivedEmailContent } from "@/lib/resend-inbound";
import { parseForwardingConfirmation } from "@/lib/forwarding-confirmation";
import { confirmGmailForwarding, isOwnInbox } from "@/lib/forwarding-autoconfirm";
import { buildForwardingAddress } from "@/lib/email-alias";
import { rawHeaderValues, recipientOwnership, type RecipientOwnership } from "@/lib/email-address";
import { loadOwnerAddresses } from "@/lib/owner-addresses";
import { extractAttachments, pickReceiptAttachment, type EmailAttachment } from "@/lib/email/attachments";
import { CLAUDE_CALL_BUDGET_MS, extractReceipt, type OcrResult } from "@/lib/ocr";
import { fieldsFromOcr } from "@/lib/receipts/ocr-fields";
import { homeCurrencyOf } from "@/lib/fx";
import { fillFromText, partialAttachmentFields, type PartialAttachmentFields } from "./attachment-fields";
import { MAX_PDF_PAGES, pdfPageCount } from "@/lib/receipts/pdf-pages";
import { EXTENSION_BY_TYPE } from "@/lib/receipts/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Parser can take a few seconds for the LLM extract path (step 5+), and
// an attachment adds an OCR call. Give it room before Resend's own retry
// kicks in.
export const maxDuration = 60;

// A further Claude call (each bounded by CLAUDE_CALL_BUDGET_MS) starts only
// while it can still finish, with ~10 s left to store the files and insert
// the row, inside maxDuration. The attachment read comes first; when it
// took long, the email text isn't read by the LLM as well (its templates
// still run) and the receipt waits in Review needed.
const LAST_CLAUDE_CALL_START_MS = maxDuration * 1000 - CLAUDE_CALL_BUDGET_MS - 10_000;

// The attached PDF or photo the email carries, when one fits the upload
// rules (type, 4 MB, PDF page cap). Null means "read the text".
async function receiptAttachmentOf(rawEml: Buffer | null): Promise<EmailAttachment | null> {
  if (!rawEml || rawEml.length === 0) return null;
  const picked = pickReceiptAttachment(extractAttachments(rawEml));
  if (!picked) return null;
  if (picked.mediaType === "application/pdf") {
    // Unopenable or too long: read the email text instead.
    const pages = await pdfPageCount(picked.bytes);
    if (pages === null || pages > MAX_PDF_PAGES) return null;
  }
  return picked;
}

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



function genericNotFound() {
  // Same body whether the alias was malformed or simply not registered —
  // an attacker spraying aliases should not be able to enumerate which
  // ones are live. Log internally for ops.
  return NextResponse.json({ error: "not deliverable" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
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

  let owner: { user_id: string } | null;
  try {
    owner = await findUserByAliasHash(aliasHash);
  } catch (err) {
    // The database didn't answer: 503 so Resend retries. A 404 here would
    // dead-letter a real receipt.
    if (!(err instanceof AliasLookupError)) {
      Sentry.captureException(err, { tags: { area: "intake-alias-lookup" } });
    }
    return NextResponse.json({ error: "temporarily unavailable" }, { status: 503 });
  }
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
  // its link (and code, in the older format) for the setup guide and stop
  // here. 500 on a failed write so
  // Resend retries; the user can't finish the Gmail setup without it.
  const confirmation = parseForwardingConfirmation({
    from: fromAddr,
    subject,
    text,
    dmarc,
  });
  if (confirmation) {
    // The user's own Gmail asked to forward here: confirm it for them, so
    // the setup guide skips the code (src/lib/forwarding-autoconfirm.ts).
    let autoConfirmedAt: string | null = null;
    if (confirmation.confirmUrl && confirmation.forAddress && confirmation.forAddressExact) {
      const owner = await loadOwnerAddresses(userId, buildForwardingAddress(aliasHash));
      if (isOwnInbox(confirmation.forAddress, owner.personal)) {
        if (await confirmGmailForwarding(confirmation.confirmUrl)) {
          autoConfirmedAt = new Date().toISOString();
        } else {
          console.warn("[intake/email] gmail forwarding auto-confirm failed");
        }
      }
    }
    const row = {
      user_id: userId,
      provider: confirmation.provider,
      code: confirmation.code,
      for_address: confirmation.forAddress,
      received_at: new Date().toISOString(),
    };
    const save = (full: boolean) =>
      supabase
        .from("email_forwarding_confirmations")
        .upsert(
          full
            ? { ...row, auto_confirmed_at: autoConfirmedAt, confirm_url: confirmation.confirmUrl }
            : row,
          { onConflict: "user_id" },
        );
    let { error: confirmationError } = await save(true);
    // A newer column isn't there yet (schema.sql not re-applied: 2026-11-08
    // auto_confirmed_at, 2026-11-13 confirm_url): keep what the old table
    // holds rather than lose the email.
    if (confirmationError?.code === "PGRST204" || confirmationError?.code === "42703") {
      ({ error: confirmationError } = await save(false));
    }
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
  // itself, read from the raw .eml, never the webhook's recipient list or
  // the envelope that brought it here. Without the raw message we can't
  // count To: headers reliably, so nothing is trusted. Only looked up for a
  // DMARC-authenticated mail, the only kind a template can trust.
  let recipient: RecipientOwnership = "none";
  if (dmarc === "pass" && rawEml && hasRaw) {
    const toHeaders = rawHeaderValues(rawEml.toString("latin1"), "to");
    const owner = await loadOwnerAddresses(userId, buildForwardingAddress(aliasHash));
    recipient = recipientOwnership(toHeaders, owner);
  }

  // An attached PDF or photo is the receipt more often than the text is.
  const attachment = await receiptAttachmentOf(hasRaw ? rawEml : null);

  // Parse (best-effort). Throw → pending_review. With an attachment the
  // text parser runs its templates only; the LLM reads the attachment.
  const parseText = async (templatesOnly: boolean) => {
    try {
      return await parseReceipt({
        kind: "email",
        raw: {
          from: fromAddr,
          to: toAddr,
          subject,
          text,
          html,
          authenticated: dmarc === "pass",
          recipient,
          templatesOnly,
        },
      });
    } catch (err) {
      console.error("[intake/email] parser threw", err);
      Sentry.captureException(err, { tags: { area: "intake-parse" } });
      return { status: "pending_review" as const };
    }
  };
  let parseResult: Awaited<ReturnType<typeof parseReceipt>> = await parseText(attachment !== null);

  const organizationId = await getOrCreateDefaultOrganization(userId);
  // The company's own currency for a receipt whose currency wasn't read
  // (the column's default would make it EUR), as /api/capture/scan does.
  let homeCurrency: string | null = null;
  const home = async () => (homeCurrency ??= await homeCurrencyOf(organizationId));

  // A trusted template hit (Uber, Stripe) beats the attachment: it is
  // verified, the attachment never is. Otherwise OCR the attachment. What
  // it read in full is used as is; what it read in part is kept and only
  // the gaps are filled from the email text; if it read nothing, the text
  // is read instead (by the LLM too, while there is time).
  const templateTrusted =
    parseResult.status === "ok" && parseResult.fields.parse_confidence >= 0.75;
  // True once OCR read the attachment: it then becomes the stored original.
  let readFromAttachment = false;
  let partial: PartialAttachmentFields | null = null;
  if (attachment && !templateTrusted) {
    let ocr: OcrResult | null = null;
    try {
      ocr = await extractReceipt(attachment.bytes.toString("base64"), attachment.mediaType);
    } catch (err) {
      console.error("[intake/email] attachment OCR failed", err instanceof Error ? err.message : "unknown");
      Sentry.captureException(err, { tags: { area: "intake-attachment-ocr" } });
    }
    const full = ocr ? fieldsFromOcr(ocr) : null;
    if (full) {
      parseResult = { status: "ok", fields: full };
      readFromAttachment = true;
    } else {
      const partlyRead = ocr ? partialAttachmentFields(ocr, await home()) : null;
      // The templates already ran; a second pass adds the LLM, if it fits.
      const textResult =
        parseResult.status === "ok"
          ? parseResult
          : Date.now() - startedAt < LAST_CLAUDE_CALL_START_MS
            ? await parseText(false)
            : parseResult;
      if (partlyRead) {
        partial = fillFromText(partlyRead, textResult.status === "ok" ? textResult.fields : null, ocr?.currency);
        readFromAttachment = true;
      } else {
        parseResult = textResult;
      }
    }
  }

  // Generate the receipt id up front so the storage path and the row both
  // reference the same uuid. If the insert later loses an idempotency race
  // (23505 on intake_ref), we best-effort delete the storage objects.
  const receiptId = crypto.randomUUID();
  // The original stored for the receipt: the attachment when its fields
  // came from it (what the accountant needs, and what a re-run reads),
  // else the whole message. The message itself is kept in both cases
  // (BFL 7 kap.: räkenskapsinformation in the form it was received); it
  // sits next to the attachment as <id>.eml and is deleted with the row.
  const original: { path: string; bytes: Buffer; contentType: string; kind: string } | null =
    attachment && readFromAttachment
      ? {
          path: `${userId}/${receiptId}.${EXTENSION_BY_TYPE[attachment.mediaType]}`,
          bytes: attachment.bytes,
          contentType: attachment.mediaType,
          kind: attachment.mediaType,
        }
      : hasRaw
        ? { path: `${userId}/${receiptId}.eml`, bytes: rawEml, contentType: "message/rfc822", kind: "eml" }
        : null;

  // Every file stored for this receipt, removed again if no row points at
  // them in the end.
  const stored: string[] = [];
  const removeStored = async () => {
    if (stored.length === 0) return;
    const paths = stored.splice(0);
    await supabase.storage
      .from("receipt-originals")
      .remove(paths)
      .catch(() => {});
  };
  const uploadFailed = async (what: string, error: unknown) => {
    console.error(`[intake/email] ${what} upload failed`, error);
    Sentry.captureException(new Error(`intake ${what} upload failed`), {
      tags: { area: "intake-upload" },
    });
    await removeStored();
    // Nothing is inserted yet: 500 so Resend redelivers and the receipt is
    // made with its original, instead of a row pointing at a missing file.
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  };

  if (original) {
    const { error: uploadError } = await supabase.storage
      .from("receipt-originals")
      .upload(original.path, original.bytes, {
        cacheControl: "3600",
        upsert: false,
        contentType: original.contentType,
      });
    if (uploadError) return uploadFailed("original", uploadError);
    stored.push(original.path);
    if (original.kind !== "eml" && hasRaw) {
      const emlPath = `${userId}/${receiptId}.eml`;
      const { error: emlError } = await supabase.storage
        .from("receipt-originals")
        .upload(emlPath, rawEml, {
          cacheControl: "3600",
          upsert: false,
          contentType: "message/rfc822",
        });
      if (emlError) return uploadFailed("eml", emlError);
      stored.push(emlPath);
    }
  }

  const baseFields = {
    id: receiptId,
    user_id: userId,
    organization_id: organizationId,
    source: "email" as const,
    intake_ref: intakeRef,
    original_source_url: original ? original.path : null,
    original_source_kind: original ? (original.kind as "eml" | EmailAttachment["mediaType"]) : null,
    // Capped: a 100 KB subject was stored whole.
    notes: subject.length > 0 ? `Subject: ${subject.slice(0, 300)}` : null,
  };

  const rowToInsert = partial
    ? {
        ...baseFields,
        ...partial,
        items: null,
        status: computeReceiptStatus({
          merchant_name: partial.merchant_name,
          purchased_at: partial.purchased_at,
          receipt_date: partial.receipt_date,
          total: partial.total,
          parse_confidence: partial.parse_confidence,
        }),
      }
    : parseResult.status === "ok"
      ? {
          ...baseFields,
          merchant_name: parseResult.fields.merchant_name,
          purchased_at: parseResult.fields.purchased_at,
          receipt_date: parseResult.fields.purchased_at.slice(0, 10),
          total: parseResult.fields.total,
          currency: parseResult.fields.currency || (await home()),
          subtotal: parseResult.fields.subtotal ?? null,
          tax_amount: parseResult.fields.tax_amount ?? null,
          tax_rate: parseResult.fields.tax_rate ?? null,
          seller_org_number: parseResult.fields.seller_org_number ?? null,
          merchant_vat_number: parseResult.fields.merchant_vat_number ?? null,
          vat_lines: parseResult.fields.vat_lines ?? null,
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
      : { ...baseFields, currency: await home(), status: "pending_review" as const };

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
      await removeStored();
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
    await removeStored();
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
