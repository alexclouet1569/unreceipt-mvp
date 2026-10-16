// SERVER-ONLY. Resend's `email.received` webhook carries metadata only
// (email_id, from, to, subject, attachment list) — never the body, headers
// or the original message. Those come from the Receiving API:
//   GET https://api.resend.com/emails/receiving/{email_id}
// plus a signed `raw.download_url` for the original .eml.
// https://resend.com/docs/dashboard/receiving/get-email-content
//
// Needs RESEND_API_KEY with full access (a sending-only key can't read
// received mail).

const RECEIVING_API = "https://api.resend.com/emails/receiving";

// The .eml includes attachments; keep storage and memory bounded.
const MAX_RAW_BYTES = 15 * 1024 * 1024;

export type ReceivedEmailContent = {
  text: string | null;
  html: string | null;
  headers: Record<string, string | string[] | undefined>;
  messageId: string | null;
  rawEml: Buffer | null;
  // SPF/DKIM/DMARC results Resend computed on receipt ("pass", "fail",
  // "gray"…). Unlike the message's own headers, the sender can't forge
  // them. Null when Resend didn't return them.
  authentication: { spf: string | null; dkim: string | null; dmarc: string | null } | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// null → the email couldn't be loaded; the webhook should answer 5xx so
// Resend retries later.
export async function fetchReceivedEmail(
  emailId: string
): Promise<ReceivedEmailContent | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[resend-inbound] RESEND_API_KEY missing — can't load received email");
    return null;
  }

  let email: Record<string, unknown>;
  try {
    // html_format=cid keeps inline images out of the HTML (as cid: refs)
    // instead of inlining them as base64 — the parser only needs the text.
    const res = await fetch(
      `${RECEIVING_API}/${encodeURIComponent(emailId)}?html_format=cid`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) {
      console.error(
        "[resend-inbound] retrieve failed",
        res.status,
        await res.text().catch(() => "")
      );
      return null;
    }
    email = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[resend-inbound] retrieve threw", err);
    return null;
  }

  const raw = email.raw as { download_url?: unknown } | null | undefined;
  let rawEml: Buffer | null = null;
  if (raw && typeof raw.download_url === "string") {
    try {
      const res = await fetch(raw.download_url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        rawEml = buf.length <= MAX_RAW_BYTES ? buf : null;
      } else {
        console.warn("[resend-inbound] raw .eml download failed", res.status);
      }
    } catch (err) {
      // Soft — the receipt still gets created, just without "view original".
      console.warn("[resend-inbound] raw .eml download threw", err);
    }
  }

  const headers =
    email.headers && typeof email.headers === "object"
      ? (email.headers as Record<string, string | string[] | undefined>)
      : {};

  const auth =
    email.authentication && typeof email.authentication === "object"
      ? (email.authentication as Record<string, unknown>)
      : null;

  return {
    text: str(email.text),
    html: str(email.html),
    headers,
    messageId: str(email.message_id),
    rawEml,
    authentication: auth
      ? { spf: str(auth.spf), dkim: str(auth.dkim), dmarc: str(auth.dmarc) }
      : null,
  };
}
