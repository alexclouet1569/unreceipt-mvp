// Which mail provider an address most likely uses, from its domain: the
// forwarding guide starts there (website and iPhone app). Pure.

export type MailProvider = "gmail" | "outlook" | "icloud" | "paid" | "other";

/** The provider an address most likely uses, from its domain. */
export function providerForEmail(email: string | null | undefined): MailProvider | null {
  const domain = email?.split("@")[1]?.trim().toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (/^(outlook|hotmail|live|msn)\.[a-z.]{2,6}$/.test(domain)) return "outlook";
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return "icloud";
  if (/^(yahoo|ymail|rocketmail)\.[a-z.]{2,6}$/.test(domain) || /^(proton\.me|protonmail\.(com|ch)|pm\.me)$/.test(domain)) {
    return "paid";
  }
  return null;
}

/** Where each provider keeps its rules (the guide's "open this page" links). */
export const PROVIDER_LINKS = {
  gmailForwarding: "https://mail.google.com/mail/u/0/#settings/fwdandpop",
  gmailFilters: "https://mail.google.com/mail/u/0/#settings/filters",
  outlookPersonal: "https://outlook.live.com/mail/0/options/mail/rules",
  outlookWork: "https://outlook.office.com/mail/options/mail/rules",
  icloud: "https://www.icloud.com/mail",
} as const;
