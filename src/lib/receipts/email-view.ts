// A receipt's email original (.eml) or text message (.txt) made readable for
// the website and the iPhone app: plain text only. The email's HTML is never
// sent to a client, so nothing in it can run a script, load a remote image
// (a tracking pixel), a stylesheet or a font, or be clicked: the server
// keeps the words and drops every tag (and elements hidden with
// display:none). Pure, no I/O, no dependency.
//
// Bounded for a hostile message: the parser reads at most 512 KB of each
// body (src/lib/mailboxes/raw-message.ts), the HTML is walked with indexOf
// and linear regular expressions only, and the text sent is capped at
// MAX_VIEW_CHARS.

import { splitHeadersAndBody } from "@/lib/email/attachments";
import { decodeHeaderValue, MAX_BODY_CHARS, parseRawMessage } from "@/lib/mailboxes/raw-message";
import type { OriginalPreview } from "@/lib/mobile/types";

export const MAX_VIEW_CHARS = 20_000;
const MAX_HEADER_CHARS = 300;
// The HTML part is what the recipient saw (a text part often leaves out the
// VAT lines or the seller's details), so it is read first; the text part
// only when there is no HTML, or the HTML has fewer words than this.
const MIN_TEXT_CHARS = 40;
// Hidden elements (display:none preheaders) removed per message, at most.
const MAX_HIDDEN = 200;

// Characters mail templates use to pad or hide text (Gmail preheaders are
// full of U+034F and U+200C), and control characters.
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ﻿ﾠ]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®", trade: "™",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", times: "×",
  laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  sbquo: "‚", bdquo: "„", deg: "°", sect: "§", para: "¶", shy: "", zwnj: "", zwj: "",
  ensp: " ", emsp: " ", thinsp: " ",
  aring: "å", Aring: "Å", auml: "ä", Auml: "Ä", ouml: "ö", Ouml: "Ö",
  eacute: "é", Eacute: "É", egrave: "è", Egrave: "È", ecirc: "ê", euml: "ë",
  agrave: "à", Agrave: "À", acirc: "â", ccedil: "ç", Ccedil: "Ç",
  icirc: "î", iuml: "ï", ocirc: "ô", ucirc: "û", ugrave: "ù", uuml: "ü", Uuml: "Ü",
  oelig: "œ", szlig: "ß", oslash: "ø", Oslash: "Ø", aelig: "æ", AElig: "Æ",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** Removes `<tag …>…</tag>` blocks (case-insensitive) with indexOf: linear on hostile input. */
function stripBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = "";
  let i = 0;
  for (;;) {
    let start = lower.indexOf(open, i);
    // `<style` must not match `<styles` (any letter after it means another tag).
    while (start !== -1 && /[a-z0-9-]/.test(lower[start + open.length] ?? "")) {
      start = lower.indexOf(open, start + 1);
    }
    if (start === -1) break;
    out += html.slice(i, start);
    const end = lower.indexOf(close, start + open.length);
    if (end === -1) {
      // Never closed: everything after it belongs to it.
      i = html.length;
      break;
    }
    const gt = lower.indexOf(">", end);
    i = gt === -1 ? html.length : gt + 1;
  }
  return out + html.slice(i);
}

function stripComments(html: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const start = html.indexOf("<!--", i);
    if (start === -1) break;
    out += html.slice(i, start);
    const end = html.indexOf("-->", start + 4);
    i = end === -1 ? html.length : end + 3;
  }
  return out + html.slice(i);
}

/** Long tracking links make a receipt unreadable: the host stands for them. */
function shortenUrls(text: string): string {
  return text.replace(/\bhttps?:\/\/[^\s<>"'\])]+/gi, (url) => {
    if (url.length <= 60) return url;
    try {
      return `${new URL(url).host}/…`;
    } catch {
      return `${url.slice(0, 40)}…`;
    }
  });
}

function tidy(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(CONTROL, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim());
  const out: string[] = [];
  for (const line of lines) {
    if (line === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return shortenUrls(out.join("\n"));
}

const HIDDEN_OPEN = /<([a-z][a-z0-9]*)\b[^<>]*\bstyle\s*=\s*("[^"]*"|'[^']*')[^<>]*>/gi;

/**
 * Removes elements styled display:none (a preheader the reader never sees)
 * with what they contain, matching nested tags of the same name. Bounded:
 * at most MAX_HIDDEN elements, each found with indexOf.
 */
function stripHidden(html: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  let removed = 0;
  HIDDEN_OPEN.lastIndex = 0;
  for (let m = HIDDEN_OPEN.exec(html); m && removed < MAX_HIDDEN; m = HIDDEN_OPEN.exec(html)) {
    if (m.index < i || !/display\s*:\s*none/i.test(m[2])) continue;
    const tag = m[1].toLowerCase();
    // A void element has nothing inside: only the tag goes.
    let end = m.index + m[0].length;
    if (!/^(?:img|br|hr|input|meta|link|wbr)$/.test(tag) && !m[0].endsWith("/>")) {
      let depth = 1;
      let at = end;
      while (depth > 0) {
        const open = lower.indexOf(`<${tag}`, at);
        const close = lower.indexOf(`</${tag}`, at);
        if (close === -1) {
          at = html.length;
          break;
        }
        if (open !== -1 && open < close) {
          depth++;
          at = open + tag.length + 1;
        } else {
          depth--;
          const gt = lower.indexOf(">", close);
          at = gt === -1 ? html.length : gt + 1;
        }
      }
      end = at;
    }
    out += html.slice(i, m.index);
    i = end;
    HIDDEN_OPEN.lastIndex = end;
    removed++;
  }
  return out + html.slice(i);
}

/** An email's HTML as plain text: the words, with line breaks where the layout had them. */
export function htmlToText(html: string): string {
  let s = stripHidden(stripComments(html));
  for (const tag of ["head", "style", "script", "title", "noscript", "template", "svg", "xml", "object", "iframe"]) {
    s = stripBlocks(s, tag);
  }
  s = s
    .replace(/<br\b[^<>]*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, "  ")
    .replace(/<\/?(?:p|div|tr|table|tbody|thead|tfoot|li|ul|ol|h[1-6]|blockquote|section|article|header|footer|center|hr|dl|dt|dd|address)\b[^<>]*>/gi, "\n")
    // `<[^<>]*>`: `<[^>]+>` backtracks quadratically on many unclosed "<".
    .replace(/<[^<>]*>/g, "");
  return tidy(decodeEntities(s));
}

function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_VIEW_CHARS) return { text, truncated: false };
  const cut = text.lastIndexOf("\n", MAX_VIEW_CHARS);
  return { text: text.slice(0, cut > MAX_VIEW_CHARS / 2 ? cut : MAX_VIEW_CHARS), truncated: true };
}

function headerText(value: string | undefined): string | null {
  if (!value) return null;
  const decoded = decodeHeaderValue(value).replace(INVISIBLE, "").replace(CONTROL, "").trim();
  return decoded ? decoded.slice(0, MAX_HEADER_CHARS) : null;
}

/** The readable view of a raw RFC 822 message. */
export function emailView(rawEml: Buffer): Extract<OriginalPreview, { type: "eml" }> {
  const { headers } = splitHeadersAndBody(rawEml);
  const message = parseRawMessage(rawEml);
  const fromHtml = message.html != null ? htmlToText(message.html) : "";
  const useHtml = fromHtml.replace(/\s/g, "").length >= MIN_TEXT_CHARS || message.text == null;
  const body = useHtml ? fromHtml : tidy(message.text ?? "");
  // The parser keeps at most MAX_BODY_CHARS of a part: a longer one was cut.
  const source = useHtml ? message.html : message.text;
  const viewed = cap(body);
  return {
    type: "eml",
    from: headerText(headers["from"]),
    to: headerText(headers["to"]),
    subject: message.subject ? message.subject.replace(INVISIBLE, "").replace(CONTROL, "") : null,
    // As written in the message, offset included: converting it to the
    // viewer's time zone could show another day.
    date: headerText(headers["date"]),
    text: viewed.text,
    truncated: viewed.truncated || (source?.length ?? 0) >= MAX_BODY_CHARS,
  };
}

/** A forwarded text message (.txt), tidied and capped. */
export function textView(raw: Buffer): Extract<OriginalPreview, { type: "txt" }> {
  const { text, truncated } = cap(tidy(raw.toString("utf8")));
  return { type: "txt", body: text, truncated };
}
