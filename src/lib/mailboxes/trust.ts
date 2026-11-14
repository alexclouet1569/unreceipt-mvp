// How much a message read from a connected mailbox is trusted (the TrustInput
// of ingestReceiptEmail, src/lib/email/ingest.ts). Pure.
//
// Today NO mailbox message is DMARC-trusted, for either provider
// (RECEIVING_AUTHSERV_IDS is null for both, so mailboxTrust() always gives
// dmarc null): a template receipt (Uber, Stripe) read from a mailbox lands
// in Review needed, filled in, and a person confirms it.
//
// Why not Gmail's own Authentication-Results: the mailbox's owner can put
// any message into their own mailbox without it ever passing Gmail's MX.
// IMAP APPEND (any mail client) or the Gmail API's messages.insert stores
// the bytes as given, headers included, so a self-written topmost
// "Authentication-Results: mx.google.com; dmarc=pass header.from=uber.com"
// above a made-up Uber receipt looks exactly like a delivered one, and
// users.history reports it as messageAdded in INBOX. Neither the header's
// position nor its authserv-id says who wrote it.
//
// What would make it trustworthy again (later work, not done here):
//   - verifying the DKIM signature ourselves (RFC 6376, public key from
//     DNS) with its d= aligned with the From: domain (DMARC alignment), as
//     a forger can't sign for uber.com; or
//   - verifying the ARC chain cryptographically (RFC 8617): an
//     ARC-Seal/ARC-Message-Signature i=1 with d=google.com, whose
//     ARC-Authentication-Results then carries Gmail's real verdict.
// Plain header reads are not enough in either case.
//
// The parser below is kept (and tested) for that work: it reads the
// TOPMOST Authentication-Results, requires the provider's authserv-id
// (Gmail: "mx.google.com"), exactly one dmarc result, "pass", and a
// header.from equal to the domain of the message's one From: address.
// ARC-Authentication-Results is a different header and never counts.
//
// To: the message's single To: header must name the connected mailbox
// (recipientOwnership, src/lib/email-address.ts: a repeated To: or a Cc:
// never counts). It is still computed; the ingest uses it only together
// with a DMARC pass, so today it decides nothing.
//
// Microsoft: Exchange Online writes its Authentication-Results without an
// authserv-id ("spf=pass …; dmarc=pass action=none header.from=…"), and
// Graph can create messages in a mailbox too, so the same reasoning holds.

import type { TrustInput } from "@/lib/email/ingest";
import { parseAddressList, rawHeaderValues, recipientOwnership } from "@/lib/email-address";
import type { MailboxProviderId } from "@/lib/types";

/**
 * The authserv-ids whose verdict counts, per provider; null trusts none.
 * Both null: a mailbox owner can write that header themselves (see above).
 */
export const RECEIVING_AUTHSERV_IDS: Record<MailboxProviderId, readonly string[] | null> = {
  google: null,
  microsoft: null,
};

/** Gmail's authserv-id, for receivingDmarcVerdict() once DKIM/ARC is verified. */
export const GMAIL_AUTHSERV_ID = "mx.google.com";

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
