// First-touch attribution for sign-ups, with nothing stored in the browser
// (demo-funnel strategy, Step 2).
//
// When someone clicks a sign-up (or demo-tour) link on the marketing site,
// the link is given the campaign tags of the page they are on (utm_source,
// utm_medium, utm_campaign), the host of the site that sent them (ref) and
// the page itself (landing). /app/login reads them back from its own URL,
// puts them in the new account's user_metadata.signup_source, and
// syncProfile() copies them once to profiles.signup_source, which the
// founder's signup digest shows.
//
// No cookie, localStorage or sessionStorage: the values travel in the link
// only. A visitor who opens a second marketing page before clicking loses
// the tags of the first one (accepted, see AGENTS.md "Analytics").
//
// Pure, client-safe. sanitizeSignupSource() is the single allow-list used by
// the browser, the login page and the server, because user_metadata is
// writable by the user.

export type SignupSource = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** Host of the referring site, never one of ours. */
  ref?: string;
  /** Path of the page the sign-up link was clicked on. */
  landing?: string;
};

export const SIGNUP_SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "ref", "landing"] as const;
type Key = (typeof SIGNUP_SOURCE_KEYS)[number];

const UTM_MAX = 100;
// Letters and digits of any script, and the separators people put in tags.
const UTM_RE = /^[\p{L}\p{N} ._\-+:/]+$/u;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
const LANDING_RE = /^\/[A-Za-z0-9\-_/]{0,199}$/;

/** Hosts that are us: a referrer from one of them says nothing about the source. */
const OWN_HOSTS = new Set(["unreceipt.com", "app.unreceipt.com", "localhost", "127.0.0.1"]);

function cleanUtm(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().replace(/\s+/g, " ");
  if (v.length === 0 || v.length > UTM_MAX || !UTM_RE.test(v)) return undefined;
  return v;
}

function cleanHost(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase().replace(/^www\./, "");
  if (!HOST_RE.test(v) || OWN_HOSTS.has(v)) return undefined;
  return v;
}

function cleanLanding(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return LANDING_RE.test(v) ? v : undefined;
}

const CLEAN: Record<Key, (v: unknown) => string | undefined> = {
  utm_source: cleanUtm,
  utm_medium: cleanUtm,
  utm_campaign: cleanUtm,
  ref: cleanHost,
  landing: cleanLanding,
};

type SourceInput =
  | URLSearchParams
  | Record<string, unknown>
  | null
  | undefined;

function readKey(input: Exclude<SourceInput, null | undefined>, key: Key): unknown {
  if (input instanceof URLSearchParams) return input.get(key);
  const v = input[key];
  // Next's searchParams give string[] for a repeated key: take none of them.
  return Array.isArray(v) ? undefined : v;
}

/**
 * The allow-listed, bounded form of a sign-up source, or null when nothing
 * valid is left. Unknown keys are dropped.
 */
export function sanitizeSignupSource(input: SourceInput): SignupSource | null {
  if (!input || typeof input !== "object") return null;
  const out: SignupSource = {};
  for (const key of SIGNUP_SOURCE_KEYS) {
    const v = CLEAN[key](readKey(input, key));
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The source of the current visit: the campaign tags and attribution params
 * already in `href` (a demo tour opened from a marketing link carries them),
 * else the tags in the URL, the referring host (left out when it is us) and
 * the page's path.
 */
export function attributionFrom(href: string, referrer: string): SignupSource | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const own = url.hostname.toLowerCase().replace(/^www\./, "");
  const refHost = hostOf(referrer)?.replace(/^www\./, "") ?? null;
  // Values the link that brought the visitor here already carried (a demo
  // tour opened from the marketing site) win: they are the first touch.
  const carried = sanitizeSignupSource(url.searchParams);
  return sanitizeSignupSource({
    utm_source: url.searchParams.get("utm_source"),
    utm_medium: url.searchParams.get("utm_medium"),
    utm_campaign: url.searchParams.get("utm_campaign"),
    ref: carried?.ref ?? (refHost && refHost !== own ? refHost : null),
    landing: carried?.landing ?? url.pathname,
  });
}

/**
 * `href` with the source's fields added as query params. Params already on
 * the link (mode=signup, next, step) are kept; fields of the source replace
 * any of the same name. Relative links stay relative.
 */
export function withAttribution(href: string, source: SignupSource | null): string {
  if (!source) return href;
  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(href);
  let url: URL;
  try {
    url = new URL(href, "https://relative.invalid");
  } catch {
    return href;
  }
  for (const key of SIGNUP_SOURCE_KEYS) {
    const v = source[key];
    if (v) url.searchParams.set(key, v);
  }
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

/**
 * One line for the founder's digest: "source / campaign / landing", e.g.
 * "linkedin / outreach / /sv". The medium follows the source in brackets,
 * the referring host is added as "· from <host>"; with no campaign tag the
 * referring host (or "direct") stands in for the source. Null when nothing
 * is known (the iPhone app, invites, accounts from before 2026-11-17).
 */
export function formatSignupSource(source: SignupSource | null): string | null {
  if (!source) return null;
  const from = source.utm_source
    ? source.utm_medium
      ? `${source.utm_source} (${source.utm_medium})`
      : source.utm_source
    : (source.ref ?? "direct");
  const line = `${from} / ${source.utm_campaign ?? "—"} / ${source.landing ?? "—"}`;
  return source.ref && source.utm_source ? `${line} · from ${source.ref}` : line;
}
