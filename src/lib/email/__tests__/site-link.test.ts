import { describe, expect, it } from "vitest";
import { emailSiteLocale, emailSiteUrl } from "../site-link";
import {
  approvalDecisionEmail,
  approvalRequestEmail,
  clientRequestEmail,
  firmClosedEmail,
  firmInviteEmail,
  firmWelcomeEmail,
  forwardingSetupEmail,
  linkConfirmationEmail,
  missingReceiptsEmail,
  pilotWelcomeEmail,
  retentionReminderEmail,
  signupDigestEmail,
  teamInviteEmail,
  waitlistEmail,
  weeklyReminderEmail,
  type EmailContent,
} from "../templates";
import type { EmailTag } from "../tags";

describe("emailSiteLocale", () => {
  it("follows the company's country first", () => {
    expect(emailSiteLocale({ country: "SE" })).toBe("sv");
    expect(emailSiteLocale({ country: "se", email: "anna@firma.fr" })).toBe("sv");
    expect(emailSiteLocale({ country: "FR", email: "anna@firma.se" })).toBe("fr");
    expect(emailSiteLocale({ country: "DE" })).toBe("en");
  });

  it("falls back to the address's country domain, else English", () => {
    expect(emailSiteLocale({ country: null, email: "anna@byran.se" })).toBe("sv");
    expect(emailSiteLocale({ country: null, email: "anne@cabinet.fr" })).toBe("fr");
    expect(emailSiteLocale({ email: "anna@gmail.com" })).toBe("en");
    expect(emailSiteLocale({})).toBe("en");
  });
});

describe("emailSiteUrl", () => {
  it("tags the flow and nothing else", () => {
    expect(emailSiteUrl("sv", "firm_invite")).toBe(
      "https://unreceipt.com/sv?utm_source=email&utm_medium=transactional&utm_campaign=firm_invite",
    );
    expect(emailSiteUrl("fr", "firm_invite")).toBe(
      "https://unreceipt.com/fr?utm_source=email&utm_medium=transactional&utm_campaign=firm_invite",
    );
    expect(emailSiteUrl("en", "weekly_reminder")).toBe(
      "https://unreceipt.com/?utm_source=email&utm_medium=transactional&utm_campaign=weekly_reminder",
    );
  });
});

// Every email someone else receives links to the site, in both parts, with
// its own flow and nothing about the recipient.
const RECIPIENT = "anna.berg@hallonbygg.se";
const cases: Array<[EmailTag, (site: "sv" | "en") => EmailContent]> = [
  ["pilot_welcome", (site) => pilotWelcomeEmail({ site, firstName: "Anna", appUrl: "https://app.unreceipt.com/app", forwardingAddress: null, pilotMode: true, canReply: true })],
  ["retention_reminder", (site) => retentionReminderEmail({ site, endedOn: "1 Nov", deleteOn: "30 Jan", settingsUrl: "https://app.unreceipt.com/app/settings", subscribeUrl: "https://app.unreceipt.com/subscribe", canReply: true })],
  ["forwarding_setup", (site) => forwardingSetupEmail({ site, url: "https://app.unreceipt.com/app/settings/forwarding" })],
  ["firm_invite", (site) => firmInviteEmail({ site, firmName: "Byrån AB", clientName: "Hallon Bygg AB", url: "https://app.unreceipt.com/app/accountant/accept?token=x" })],
  ["client_request", (site) => clientRequestEmail({ site, clientName: "Hallon Bygg AB", url: "https://app.unreceipt.com/app/firm-request?token=x" })],
  ["link_confirmation", (site) => linkConfirmationEmail({ site, firmName: "Byrån AB", settingsUrl: "https://app.unreceipt.com/app/settings" })],
  ["firm_closed", (site) => firmClosedEmail({ site, firmName: "Byrån AB", settingsUrl: "https://app.unreceipt.com/app/settings" })],
  ["missing_receipts", (site) => missingReceiptsEmail({ site, firmName: "Byrån AB", clientName: "Hallon Bygg AB", monthLabel: "November 2026", lines: [{ day: "Nov 5", description: "HORNBACH", amount: "1,249.00 kr" }], total: "1,249.00 kr", appUrl: "https://app.unreceipt.com/app" })],
  ["weekly_reminder", (site) => weeklyReminderEmail({ site, campaign: "weekly_reminder", firmName: "Byrån AB", clientName: "Hallon Bygg AB", payments: [], receipts: [], toConfirm: 2, appUrl: "https://app.unreceipt.com/app", settingsUrl: "https://app.unreceipt.com/app/settings" })],
  ["manual_reminder", (site) => weeklyReminderEmail({ site, campaign: "manual_reminder", firmName: "Byrån AB", clientName: "Hallon Bygg AB", payments: [], receipts: [], toConfirm: 2, appUrl: "https://app.unreceipt.com/app", settingsUrl: "https://app.unreceipt.com/app/settings" })],
  ["firm_welcome", (site) => firmWelcomeEmail({ site, firmName: "Byrån AB", signInUrl: "https://app.unreceipt.com/app/login?next=/firm" })],
  ["team_invite", (site) => teamInviteEmail({ site, companyName: "Hallon Bygg AB", inviterName: "Erik", url: "https://app.unreceipt.com/app/team-join" })],
  ["approval_request", (site) => approvalRequestEmail({ site, employee: "Anna Berg", url: "https://app.unreceipt.com/app/team" })],
  ["approval_decision", (site) => approvalDecisionEmail({ site, decision: "sent_back", merchant: "Hornbach", comment: "Wrong project", url: "https://app.unreceipt.com/app" })],
];

describe("footer link in every transactional email", () => {
  it.each(cases)("%s links to the chosen site with its own campaign", (tag, build) => {
    for (const site of ["sv", "en"] as const) {
      const email = build(site);
      const url = emailSiteUrl(site, tag);
      expect(email.html).toContain(`href="${url.replace(/&/g, "&amp;")}"`);
      expect(email.html).toContain(">unreceipt.com</a> &middot; Paper is Past");
      expect(email.text.endsWith(`unreceipt.com: ${url}`)).toBe(true);
      // Nothing about the recipient travels in the link.
      for (const u of [url]) {
        expect(u).not.toContain("@");
        expect(u).not.toMatch(/anna|hallon|byr/i);
      }
    }
  });

  it("waitlist (people outside Sweden) links to the English site", () => {
    const email = waitlistEmail({ joinUrl: "https://app.unreceipt.com/app/login?mode=signup", pilotMode: true, canReply: true });
    expect(email.text).toContain(`unreceipt.com: ${emailSiteUrl("en", "waitlist")}`);
  });

  it("the founder's own digest has no link", () => {
    const digest = signupDigestEmail({ signups: [], moreSignups: 0, waitlist: [{ email: RECIPIENT, signedUpAt: new Date("2026-11-17T10:00:00Z"), source: null }], totalAccounts: 3 });
    expect(digest.html).not.toContain("utm_source");
    expect(digest.text).not.toContain("utm_source");
  });
});
