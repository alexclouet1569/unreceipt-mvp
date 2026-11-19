/**
 * The support address shown to visitors (footer "Contact", fact sheets).
 * Demo requests never use it: every "Book a demo" goes to the demo request
 * page (`demoRequestPath()`), which a test enforces. Client-safe.
 */
export const SUPPORT_EMAIL = "support@unreceipt.com";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/**
 * UnReceipt's LinkedIn company page (public address, without the admin's
 * "/home/?viewAsMember=true" view). Footer link and the Organization's
 * `sameAs` (src/lib/seo.ts).
 */
export const LINKEDIN_URL = "https://www.linkedin.com/company/unreceipt/";
