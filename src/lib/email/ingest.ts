// SERVER-ONLY (service role). One email → one receipt row: the pipeline
// every way of receiving an email shares. Today that is the Resend inbound
// webhook (src/app/api/intake/email/route.ts, the user's forwarding alias);
// a connected Gmail/Outlook mailbox read through its API will call the same
// function with the raw RFC 822 message it fetched.
//
// Flow:
//   1. intake_ref = Message-Id || sha256(raw .eml) (|| sha256 of the
//      caller's fallback identity when there is neither).
//   2. Existing (user_id, intake_ref) row → "duplicate", no side effects.
//   3. Run the parser. Parser throw → pending_review (row still inserted
//      with nullable canonical fields so the user can complete it).
//   3b. An attached PDF or photo (the usual case for a forwarded invoice
//      or a photographed receipt) is read with Claude OCR instead of the
//      email text, unless a trusted template already read the mail. The
//      attachment is then stored as the original, byte for byte, next to
//      the .eml; its fields land in Review needed like any untrusted
//      extraction. When OCR read only part of it, what it read is kept and
//      the email text fills the gaps (./attachment-fields.ts).
//   4. Upload the original (attachment or .eml) to receipt-originals, then
//      insert the row. A failed upload of an original returns "retry"
//      before anything is inserted, so the sender redelivers.
//
// Every receipt made here has receipts.source 'email' whatever the channel:
// receipts_source_check (supabase/schema.sql) allows no other email value.

import * as Sentry from "@sentry/nextjs";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordReceiptUsage } from "@/lib/usage";
import { getOrCreateDefaultOrganization } from "@/lib/organizations";
import { parseReceipt } from "@/lib/receipts/parser";
import { computeReceiptStatus } from "@/lib/receipts/status";
import type { ReceiptStatus } from "@/lib/types";
import { rawHeaderValues, recipientOwnership, type RecipientOwnership } from "@/lib/email-address";
import { loadOwnerAddresses } from "@/lib/owner-addresses";
import { extractAttachments, pickReceiptAttachment, type EmailAttachment } from "@/lib/email/attachments";
import { extractReceipt, type OcrResult } from "@/lib/ocr";
import { fieldsFromOcr } from "@/lib/receipts/ocr-fields";
import { homeCurrencyOf } from "@/lib/fx";
import { fillFromText, partialAttachmentFields, type PartialAttachmentFields } from "@/lib/email/attachment-fields";
import { MAX_PDF_PAGES, pdfPageCount } from "@/lib/receipts/pdf-pages";
import { EXTENSION_BY_TYPE } from "@/lib/receipts/upload-limits";

/**
 * What decides whether a template (Uber, Stripe) may mark the receipt
 * verified. Explicit so each channel passes its own verdict.
 */
export type TrustInput = {
  /**
   * The DMARC verdict for the From: domain, from the server that received
   * the message (Resend's for the forwarding alias). Only "pass" counts:
   * the From: domain is genuine.
   */
  dmarc: string | null;
  /**
   * Who the message was originally sent to. "to-header": read here from
   * the To: header of the raw message itself (never an envelope or a
   * webhook's recipient list) against the user's own inboxes, with
   * `aliasAddress` counted as their forwarding alias. "given": the
   * channel decided. Either way it is only looked at on a DMARC pass, the
   * only kind of mail a template can trust.
   */
  recipient:
    | { from: "to-header"; aliasAddress: string }
    | { from: "given"; ownership: RecipientOwnership };
};

export type IngestInput = {
  userId: string;
  /** The company the receipt belongs to; the user's default one when absent. */
  organizationId?: string;
  /**
   * How the email arrived. Logging only: receipts.source is 'email' for
   * both (receipts_source_check allows nothing else for an email).
   */
  source: "forwarding" | "mailbox";
  /** The original RFC 822 message, when the channel has it. */
  rawEml: Buffer | null;
  text: string | null;
  html: string | null;
  subject: string;
  /** The sender's address. */
  from: string;
  /** The address the message reached us at (the alias, or the mailbox). */
  to: string;
  /** The message's Message-Id; else read from `headers`. */
  messageId: string | null;
  headers?: Record<string, string | string[] | undefined>;
  /**
   * Hashed into intake_ref when there is neither a Message-Id nor a raw
   * message, so re-deliveries of the same body still dedupe. Serialised as
   * given (key order matters); defaults to { to, from, subject, text }.
   */
  fallbackIdentity?: Record<string, unknown>;
  trust: TrustInput;
  /**
   * Epoch ms after which no further Claude call starts (each is bounded by
   * CLAUDE_CALL_BUDGET_MS). Absent: no limit.
   */
  deadline?: number;
};

export type IngestResult =
  | { kind: "created"; receiptId: string; status: ReceiptStatus }
  | { kind: "duplicate"; receiptId: string }
  /**
   * Nothing was saved (or what was stored was removed again); the sender
   * should deliver the message again. Resend: 5xx.
   */
  | { kind: "retry"; reason: "lookup_failed" | "upload_failed" | "insert_failed" };

/** Postgres text can't hold NUL; one in the subject failed the insert and
 *  lost the email on every retry. */
export function stripNul(value: string): string {
  return value.replace(/\u0000/g, "");
}

/** A subject safe to store and parse: no NUL, and capped (real subjects are
 *  short, and long ones feed slow regexes). */
export function cleanSubject(value: unknown): string {
  return typeof value === "string" ? stripNul(value).slice(0, 500) : "";
}

export function pickHeader(
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

export async function ingestReceiptEmail(input: IngestInput): Promise<IngestResult> {
  const { userId, rawEml, trust } = input;
  const tag = input.source === "mailbox" ? "[intake/mailbox]" : "[intake/email]";
  const supabase = getSupabaseAdmin();
  // Already clean when the route passes them; the other channels get the
  // same treatment.
  const subject = cleanSubject(input.subject);
  const text = input.text === null ? null : stripNul(input.text);
  const html = input.html === null ? null : stripNul(input.html);
  const dmarc = trust.dmarc;
  const hasRaw = rawEml !== null && rawEml.length > 0;

  // intake_ref: prefer Message-Id (provider-stable identity that survives
  // re-forwarding by the user). Fall back to sha256 of the raw .eml so we
  // still get idempotency on senders that strip Message-Id.
  const messageId = input.messageId ?? pickHeader(input.headers, "Message-Id");
  let intakeRef: string | null = messageId && messageId.trim().length > 0 ? messageId.trim() : null;
  if (!intakeRef) {
    if (hasRaw) {
      intakeRef = `sha256:${createHash("sha256").update(rawEml).digest("hex")}`;
    } else {
      // No Message-Id and no raw payload — fall back to a hash of the
      // visible fields so re-deliveries of the same body still dedupe.
      intakeRef = `sha256:${createHash("sha256")
        .update(
          JSON.stringify(
            input.fallbackIdentity ?? { to: input.to, from: input.from, subject, text }
          )
        )
        .digest("hex")}`;
    }
  }

  // Idempotency: existing row → its id, no side effects. Scoped to the
  // user: Message-Id is sender-controlled, so a global key would let one
  // user's row swallow another user's copy of the same email.
  const { data: existing, error: existingError } = await supabase
    .from("receipts")
    .select("id")
    .eq("user_id", userId)
    .eq("intake_ref", intakeRef)
    .maybeSingle();
  if (existingError) {
    console.error(`${tag} intake_ref lookup failed`, existingError);
    return { kind: "retry", reason: "lookup_failed" };
  }
  if (existing) {
    return { kind: "duplicate", receiptId: existing.id };
  }

  // Who the email was originally sent to: the To: header of the message
  // itself, read from the raw .eml, never the webhook's recipient list or
  // the envelope that brought it here. Without the raw message we can't
  // count To: headers reliably, so nothing is trusted. Only looked up for a
  // DMARC-authenticated mail, the only kind a template can trust.
  let recipient: RecipientOwnership = "none";
  if (dmarc === "pass") {
    if (trust.recipient.from === "given") {
      recipient = trust.recipient.ownership;
    } else if (rawEml && hasRaw) {
      const toHeaders = rawHeaderValues(rawEml.toString("latin1"), "to");
      const owner = await loadOwnerAddresses(userId, trust.recipient.aliasAddress);
      recipient = recipientOwnership(toHeaders, owner);
    }
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
          from: input.from,
          to: input.to,
          subject,
          text,
          html,
          authenticated: dmarc === "pass",
          recipient,
          templatesOnly,
        },
      });
    } catch (err) {
      console.error(`${tag} parser threw`, err);
      Sentry.captureException(err, { tags: { area: "intake-parse" } });
      return { status: "pending_review" as const };
    }
  };
  let parseResult: Awaited<ReturnType<typeof parseReceipt>> = await parseText(attachment !== null);

  const organizationId = input.organizationId ?? (await getOrCreateDefaultOrganization(userId));
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
      console.error(`${tag} attachment OCR failed`, err instanceof Error ? err.message : "unknown");
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
          : input.deadline === undefined || Date.now() < input.deadline
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
  const uploadFailed = async (what: string, error: unknown): Promise<IngestResult> => {
    console.error(`${tag} ${what} upload failed`, error);
    Sentry.captureException(new Error(`intake ${what} upload failed`), {
      tags: { area: "intake-upload" },
    });
    await removeStored();
    // Nothing is inserted yet: retry so the sender redelivers and the
    // receipt is made with its original, instead of a row pointing at a
    // missing file.
    return { kind: "retry", reason: "upload_failed" };
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
        return { kind: "duplicate", receiptId: winner.id };
      }
    }

    console.error(`${tag} insert failed`, insertError);
    Sentry.captureException(new Error("intake insert failed"), {
      tags: { area: "intake-insert" },
      extra: { code: (insertError as { code?: string } | null)?.code },
    });
    await removeStored();
    return { kind: "retry", reason: "insert_failed" };
  }

  // Anyone who knows an alias can email it, so an inbound email only
  // counts toward the plan once it's a verified receipt. Rows that land
  // in pending_review (spam, newsletters, unparseable mail) count when
  // the user confirms them (PATCH /api/receipts/[id]); deleting them
  // costs nothing.
  if (rowToInsert.status === "verified") {
    await recordReceiptUsage({ userId, receiptId: inserted.id, source: "email" });
  }

  return { kind: "created", receiptId: inserted.id, status: rowToInsert.status };
}
