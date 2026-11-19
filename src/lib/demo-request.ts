/**
 * The demo request form (/book-demo, /sv/boka-demo, /fr/demander-une-demo,
 * and at the end of the home and audience pages) and the contact page
 * (/contact, /sv/kontakt, /fr/contact), both → POST /api/demo-request.
 * Pure data and helpers, safe to import from the client form; the zod
 * schema lives in demo-request-schema.ts so the browser doesn't load zod.
 */

/**
 * What the visitor asks for: a demo, or anything else (a question, a
 * partnership, "tell me when you launch in my country"). A demo needs the
 * company questions; another request needs a message.
 */
export const REQUEST_KINDS = ["demo", "question"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/**
 * Every kind the route stores: the demo form's two, plus `contact` from the
 * contact page (name, email, a reason and a message; no company needed).
 */
export const STORED_REQUEST_KINDS = [...REQUEST_KINDS, "contact"] as const;
export type StoredRequestKind = (typeof STORED_REQUEST_KINDS)[number];

/** Why someone writes from the contact page. Stored as is. */
export const CONTACT_TOPICS = ["product", "support", "accountant", "partnership", "press", "other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** The founder's email reads them in English. */
export const CONTACT_TOPIC_NAMES: Record<ContactTopic, string> = {
  product: "Question about UnReceipt",
  support: "Help with an account",
  accountant: "Accounting firm",
  partnership: "Partnership",
  press: "Press",
  other: "Something else",
};

/** Number of employees, as the form offers it. Stored as is. */
export const EMPLOYEE_BANDS = ["1", "2-5", "6-15", "16-50", "50+"] as const;
export type EmployeeBand = (typeof EMPLOYEE_BANDS)[number];

/** Bookkeeping software, as the form offers it. Stored as is. */
export const BOOKKEEPING_OPTIONS = ["fortnox", "visma", "bokio", "other", "none"] as const;
export type BookkeepingOption = (typeof BOOKKEEPING_OPTIONS)[number];

/** Languages the demo page exists in. */
export const DEMO_REQUEST_LOCALES = ["en", "sv", "fr"] as const;
export type DemoRequestLocale = (typeof DEMO_REQUEST_LOCALES)[number];

export const DEMO_REQUEST_LIMITS = {
  name: 100,
  company: 120,
  email: 254,
  phone: 40,
  message: 2000,
} as const;

/** Display names, the same in every language. */
export const BOOKKEEPING_NAMES: Record<BookkeepingOption, string> = {
  fortnox: "Fortnox",
  visma: "Visma",
  bokio: "Bokio",
  other: "Other",
  none: "None",
};

// Cal.com's booking pages read `name` and `email` from the query string and
// fill in the form; other hosts get the plain link (no reason to hand them
// the visitor's address).
const PREFILL_HOSTS = ["cal.com", "cal.eu"];

function isPrefillHost(host: string): boolean {
  return PREFILL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * The "Choose a time" link after a demo request: NEXT_PUBLIC_DEMO_BOOKING_URL
 * when it is an https URL, else null (the page then only promises an email).
 * Name and email are added only for Cal.com hosts.
 */
export function demoBookingUrl(
  raw: string | null | undefined,
  prefill?: { name?: string; email?: string }
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (prefill && isPrefillHost(url.hostname.toLowerCase())) {
    if (prefill.name?.trim()) url.searchParams.set("name", prefill.name.trim());
    if (prefill.email?.trim()) url.searchParams.set("email", prefill.email.trim());
  }
  return url.toString();
}
