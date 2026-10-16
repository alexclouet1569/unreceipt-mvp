// SERVER-ONLY. Thin wrapper around the Resend REST API — one fetch, never
// throws. Callers decide what a failed send means for them (the waitlist
// signup still succeeds; the welcome email releases its "sent" claim).
//
// Sender domain unreceipt.com is verified in Resend (eu-west-1). Replies go
// to the founder (first address in CONCIERGE_ADMIN_EMAILS) because
// unreceipt.com itself has no inbox.

const RESEND_URL = "https://api.resend.com/emails";

export const FROM_ADDRESS = "UnReceipt <hello@unreceipt.com>";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  // Shows up in the Resend dashboard so the two flows are easy to tell apart.
  tag: "waitlist" | "pilot_welcome" | "retention_reminder" | "forwarding_setup";
};

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not_configured" | "rejected" | "network"; status?: number };

export function founderReplyTo(): string | null {
  const first = (process.env.CONCIERGE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.includes("@"));
  return first ?? null;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY missing — ${email.tag} email not sent`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        tags: [{ name: "flow", value: email.tag }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend rejected ${email.tag} email:`, res.status, body);
      return { ok: false, reason: "rejected", status: res.status };
    }

    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: json?.id ?? null };
  } catch (err) {
    console.error(`[email] Resend unreachable for ${email.tag} email:`, err);
    return { ok: false, reason: "network" };
  }
}
