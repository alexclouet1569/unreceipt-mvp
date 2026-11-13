// Resend Inbound webhook → canonical receipts row.
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
//   4. Everything else is the shared email → receipt pipeline,
//      ingestReceiptEmail() in src/lib/email/ingest.ts (intake_ref and
//      dedupe, attachment OCR, templates and their trust, originals in
//      storage, the insert, usage). Its result maps to the status here:
//      created/duplicate → 200, retry → 500 so Resend redelivers.
//
// Provider needs a 2xx to stop retrying. We return 200 even on logical
// no-ops (unknown alias still returns 404 — Resend will dead-letter
// those, which is correct; a failed alias lookup is a 503, retried). Signature failures return 401 so the
// provider's retry logic kicks in (real signing issues are usually
// transient config drift on the provider side).

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { verifyWebhookSignature } from "@/lib/webhook-signature";
import {
  AliasLookupError,
  findUserByAliasHash,
  parseAliasFromTo,
} from "@/lib/email-alias";
import { fetchReceivedEmail, type ReceivedEmailContent } from "@/lib/resend-inbound";
import { parseForwardingConfirmation } from "@/lib/forwarding-confirmation";
import { confirmGmailForwarding, isOwnInbox } from "@/lib/forwarding-autoconfirm";
import { buildForwardingAddress } from "@/lib/email-alias";
import { loadOwnerAddresses } from "@/lib/owner-addresses";
import { CLAUDE_CALL_BUDGET_MS } from "@/lib/ocr";
import { cleanSubject, ingestReceiptEmail, stripNul, type IngestResult } from "@/lib/email/ingest";

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
  // No NUL (Postgres text can't hold one) and a capped subject, for the
  // confirmation check below as for the receipt (src/lib/email/ingest.ts).
  const subject = cleanSubject(data.subject);
  const text = content.text == null ? null : stripNul(content.text);
  const html = content.html == null ? null : stripNul(content.html);
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

  const result = await ingestReceiptEmail({
    userId,
    source: "forwarding",
    rawEml: content.rawEml,
    text,
    html,
    subject,
    from: fromAddr,
    to: toAddr,
    messageId: content.messageId,
    headers: content.headers,
    // The hash the route has always used, kept so a redelivery of a mail
    // without Message-Id or raw message still finds its earlier row.
    fallbackIdentity: {
      emailId: data.email_id,
      toAddr,
      fromAddr,
      subject: data.subject,
      text,
    },
    trust: {
      dmarc,
      recipient: { from: "to-header", aliasAddress: buildForwardingAddress(aliasHash) },
    },
    deadline: startedAt + LAST_CLAUDE_CALL_START_MS,
  });
  return ingestResponse(result);
}

// The status codes Resend sees: 2xx stops its retries, 5xx asks for a
// redelivery (nothing was saved).
function ingestResponse(result: IngestResult) {
  switch (result.kind) {
    case "created":
      return NextResponse.json({ ok: true, id: result.receiptId });
    case "duplicate":
      return NextResponse.json({ ok: true, id: result.receiptId, duplicate: true });
    case "retry":
      return NextResponse.json(
        {
          error:
            result.reason === "lookup_failed"
              ? "lookup failed"
              : result.reason === "upload_failed"
                ? "upload failed"
                : "insert failed",
        },
        { status: 500 }
      );
  }
}
