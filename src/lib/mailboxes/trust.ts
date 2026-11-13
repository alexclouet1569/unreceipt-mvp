// How much a message read from a connected mailbox is trusted (the TrustInput
// of ingestReceiptEmail, src/lib/email/ingest.ts). Pure.
//
// A template (Uber, Stripe) may mark a receipt verified only when both hold:
//
//   DMARC  The receiving provider's own verdict says the From: domain is
//          genuine: the TOPMOST Authentication-Results header of the
//          message must carry the provider's authserv-id (Gmail:
//          "mx.google.com"), hold exactly one dmarc result, that result is
//          "pass", and its header.from is the domain of the message's one
//          From: address. Providers prepend their header on delivery, so a
//          header a sender wrote sits below it and is never read; when the
//          topmost header isn't the provider's (a message that reached the
//          mailbox some other way, such as a POP fetch or an import) nothing
//          is trusted, rather than reading further down where a sender's
//          own header could be. ARC-Authentication-Results is a different
//          header and never counts.
//   To:    The message's single To: header names the connected mailbox
//          (recipientOwnership, src/lib/email-address.ts: a repeated To:
//          or a Cc: never counts).
//
// Residual risk, accepted: mail between two users of the same Google
// Workspace domain may be delivered without Google's own header, so a
// colleague could write a fake one; the From: must still be the template's
// own domain and the result is only "verified" instead of Review needed.
//
// Microsoft: Exchange Online writes its Authentication-Results without an
// authserv-id ("spf=pass …; dmarc=pass action=none header.from=…"), so the
// receiving server can't be told from a sender's header by its name. Until
// that is settled on real messages, Outlook mail is never DMARC-trusted
// (dmarc null): its template receipts land in Review needed.

import type { TrustInput } from "@/lib/email/ingest";
import { parseAddressList, rawHeaderValues, recipientOwnership } from "@/lib/email-address";
import type { MailboxProviderId } from "@/lib/types";

/** The authserv-ids whose verdict counts, per provider; null trusts none. */
export const RECEIVING_AUTHSERV_IDS: Record<MailboxProviderId, readonly string[] | null> = {
  google: ["mx.google.com"],
  microsoft: null,
};

type ResInfo = { method: string; result: string; props: Record<string, string> };

/** Removes RFC 5322 comments (nested, with quoted-pairs) outside quoted strings. */
function stripComments(value: string): string | null {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && (quoted || depth > 0)) {
      if (depth === 0) out += ch + (value[i + 1] ?? "");
      i++;
      continue;
    }
    if (depth > 0) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") {
      depth++;
      out += " ";
      continue;
    }
    out += ch;
  }
  return depth === 0 && !quoted ? out : null;
}

/**
 * One Authentication-Results value (RFC 8601): the authserv-id and each
 * result. Null when it can't be read.
 */
export function parseAuthenticationResults(value: string): { authservId: string; results: ResInfo[] } | null {
  if (value.length > 8000) return null;
  const clean = stripComments(value);
  if (clean === null) return null;
  const [head, ...rest] = clean.split(";");
  // authserv-id [version]
  const authservId = head.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!authservId || authservId.includes("=")) return null;
  const results: ResInfo[] = [];
  for (const segment of rest) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens[0].toLowerCase() === "none") continue;
    const m = /^([a-z0-9_-]+)(?:\/\d+)?=([a-z0-9_-]+)$/i.exec(tokens[0]);
    if (!m) continue;
    const props: Record<string, string> = {};
    for (const token of tokens.slice(1)) {
      const p = /^([a-z0-9_-]+(?:\.[a-z0-9_-]+)?)=(.*)$/i.exec(token);
      if (p) props[p[1].toLowerCase()] = p[2].replace(/^"|"$/g, "");
    }
    results.push({ method: m[1].toLowerCase(), result: m[2].toLowerCase(), props });
  }
  return { authservId, results };
}

/** The domain of the message's one From: address, or null (none, several, unreadable). */
export function singleFromDomain(headerText: string): string | null {
  const froms = rawHeaderValues(headerText, "from");
  if (!froms || froms.length !== 1) return null;
  const addresses = parseAddressList(froms[0]);
  if (addresses.length !== 1) return null;
  return addresses[0].slice(addresses[0].lastIndexOf("@") + 1);
}

/**
 * The receiving provider's DMARC verdict for the From: domain ("pass",
 * "fail", …), or null when it can't be attributed to the provider and to
 * this From: domain.
 */
export function receivingDmarcVerdict(headerText: string, authservIds: readonly string[]): string | null {
  const values = rawHeaderValues(headerText, "authentication-results");
  if (!values || values.length === 0) return null;
  const top = parseAuthenticationResults(values[0]);
  if (!top || !authservIds.includes(top.authservId)) return null;
  const dmarc = top.results.filter((r) => r.method === "dmarc");
  if (dmarc.length !== 1) return null;
  const fromDomain = singleFromDomain(headerText);
  const claimed = dmarc[0].props["header.from"]?.toLowerCase().replace(/\.$/, "");
  if (!fromDomain || !claimed || claimed !== fromDomain) return null;
  return dmarc[0].result;
}

export function mailboxTrust(input: {
  rawEml: Buffer;
  provider: MailboxProviderId;
  // The connected address (mailbox_connections.email).
  mailboxEmail: string;
}): TrustInput {
  const headerText = input.rawEml.toString("latin1");
  const authservIds = RECEIVING_AUTHSERV_IDS[input.provider];
  const dmarc = authservIds ? receivingDmarcVerdict(headerText, authservIds) : null;
  // The connected address is the only "own" inbox here; no alias exists.
  const ownership = recipientOwnership(rawHeaderValues(headerText, "to"), {
    personal: [input.mailboxEmail],
    alias: "",
  });
  return { dmarc, recipient: { from: "given", ownership: ownership === "personal" ? "personal" : "none" } };
}
