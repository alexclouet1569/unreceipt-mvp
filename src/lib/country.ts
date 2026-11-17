// A new company's country, guessed from the person's own sign-up request
// (founder decision 2026-11-16: detect, don't ask), and the currency that
// follows from it. Pure: the caller reads the request headers. Client-safe.
//
// Signals, strongest first:
//   1. The browser's or phone's language-region ("sv-SE", "pl-PL", iOS's
//      "en-SE"): how the device is set up, so it holds while travelling.
//      "en-US" and "en-GB" are the default of many browsers anywhere, so
//      they count only when the location agrees. A bare language counts
//      when one country speaks it ("sv", "pl"; not "en", "de", "fr").
//   2. The country domain of the sign-in address (".se", ".pl", ".co.uk").
//   3. Where the request comes from (Vercel's x-vercel-ip-country), which
//      is wrong for travellers and VPNs, hence last.
// Nothing → null, and the company starts Swedish as before.
//
// On the website the person picks the country at sign-up (founder decision
// 2026-11-17: ask, pre-filled with this guess); that answer comes first
// (loadHome()). The owner can change the company's currency in Settings;
// that never changes the country.

import { DEFAULT_CURRENCY_BY_COUNTRY, FALLBACK_HOME_CURRENCY } from "@/lib/bookkeeping/rules";

const COUNTRY = /^[A-Z]{2}$/;

// ISO 3166-1 alpha-2, plus XK (Kosovo, user-assigned but used by banks and
// the EU). A guess outside it ("ZZ" from a made-up language tag or a
// ".zz" address) is no guess.
const ISO_COUNTRIES = new Set(
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
    "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
    "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
    "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
    "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
    "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
  ).split(" ")
);
const known = (c: string | null | undefined): string | null => (c && ISO_COUNTRIES.has(c) ? c : null);

/** A real ISO 3166 country code (e.g. from the sign-up form's metadata). */
export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && ISO_COUNTRIES.has(value);
}

/**
 * The country the person chose at sign-up on the website, or null. Every
 * flow that creates the user's own company passes it on, so an invite or a
 * firm's join link opened before /app keeps the choice.
 */
export function chosenCountry(user: { user_metadata?: Record<string, unknown> | null }): string | null {
  const c = user.user_metadata?.country;
  return isCountryCode(c) ? c : null;
}

// The countries the sign-up form offers: Europe (every country with its
// own default currency, and those whose currency has no ECB rate) and the
// US. Anyone else picks "Another country" and gets the guess.
export const SIGNUP_COUNTRIES: readonly string[] = [
  "AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FO", "FR", "GB",
  "GL", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO",
  "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "TR", "UA", "US", "VA", "XK",
];

// Languages spoken as the main language of one country only.
const LANGUAGE_COUNTRY: Record<string, string> = {
  sv: "SE", nb: "NO", nn: "NO", no: "NO", da: "DK", is: "IS", fi: "FI", pl: "PL", cs: "CZ", sk: "SK",
  hu: "HU", ro: "RO", bg: "BG", hr: "HR", sl: "SI", et: "EE", lv: "LV", lt: "LT", el: "GR", it: "IT",
  nl: "NL", uk: "UA", sr: "RS", mk: "MK", sq: "AL", tr: "TR", mt: "MT", lb: "LU",
};

// Region tags that browsers set by default whatever the country.
const DEFAULT_TAGS = new Set(["en-US", "en-GB"]);

// Country domains whose code isn't the country's ISO code.
const TLD_COUNTRY: Record<string, string> = { uk: "GB" };
// Country domains that are mostly used for something else.
const GENERIC_TLDS = new Set(["io", "ai", "co", "me", "tv", "fm", "ly", "to", "cc", "ws", "gg", "eu"]);

export type CountryHints = {
  /** Vercel's x-vercel-ip-country. */
  ipCountry?: string | null;
  acceptLanguage?: string | null;
  email?: string | null;
};

function fromLanguage(acceptLanguage: string | null | undefined, ipCountry: string | null) {
  // The first (preferred) language only.
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();
  if (!first) return null;
  const [lang, ...rest] = first.split(/[-_]/);
  const region = rest.find((p) => /^[A-Za-z]{2}$/.test(p))?.toUpperCase();
  const tag = region ? `${lang.toLowerCase()}-${region}` : lang.toLowerCase();
  if (region && COUNTRY.test(region)) {
    if (!DEFAULT_TAGS.has(tag)) return known(region);
    return region === ipCountry ? region : null;
  }
  return LANGUAGE_COUNTRY[lang.toLowerCase()] ?? null;
}

function fromEmail(email: string | null | undefined) {
  const tld = email?.trim().toLowerCase().match(/@[^@\s]+\.([a-z]{2})$/)?.[1];
  if (!tld || GENERIC_TLDS.has(tld)) return null;
  return TLD_COUNTRY[tld] ?? known(tld.toUpperCase());
}

/** The company's likely country (ISO 3166 alpha-2), or null without a sign. */
export function guessCountry({ ipCountry, acceptLanguage, email }: CountryHints): string | null {
  // Placeholders some proxies send ("XX", "T1") aren't countries.
  const located = ipCountry && COUNTRY.test(ipCountry.trim().toUpperCase()) ? known(ipCountry.trim().toUpperCase()) : null;
  return fromLanguage(acceptLanguage, located) ?? fromEmail(email) ?? located;
}

/** The currency a company in `country` starts with. */
export function defaultCurrencyFor(country: string): string {
  return DEFAULT_CURRENCY_BY_COUNTRY[country] ?? FALLBACK_HOME_CURRENCY;
}
