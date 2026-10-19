import { describe, expect, it } from "vitest";
import {
  companySiteFor,
  firstNameFrom,
  pilotWelcomeEmail,
  signupDigestEmail,
  signupOutreach,
  waitlistEmail,
} from "../templates";

const activity = {
  receiptsAdded: 0,
  forwardedReceipts: 0,
  receiptAdders: 0,
  totalReceipts: 0,
  reviewNeeded: 0,
  signedIn: 0,
  unconfirmedCharges: 0,
  liveVersion: null,
};

const welcome = (overrides: Partial<Parameters<typeof pilotWelcomeEmail>[0]> = {}) =>
  pilotWelcomeEmail({
    firstName: "Alex",
    appUrl: "https://app.unreceipt.com/app",
    forwardingAddress: null,
    pilotMode: true,
    canReply: true,
    ...overrides,
  });

describe("pilotWelcomeEmail", () => {
  it("greets by first name and links to the app", () => {
    const email = welcome();
    expect(email.subject).toBe("Welcome to the UnReceipt pilot");
    expect(email.html).toContain("Hey Alex, welcome aboard");
    expect(email.html).toContain('href="https://app.unreceipt.com/app"');
    expect(email.text).toContain("Open UnReceipt: https://app.unreceipt.com/app");
    expect(email.text).toContain("We saw that you've just joined the UnReceipt pilot");
  });

  it("falls back to 'Hey there' without a name", () => {
    expect(welcome({ firstName: null }).html).toContain("Hey there, welcome aboard");
  });

  it("only mentions email forwarding when there is a live forwarding address", () => {
    expect(welcome().text).not.toMatch(/forward/i);
    const withForwarding = welcome({ forwardingAddress: "receipts+abc123@in.unreceipt.com" });
    expect(withForwarding.html).toContain("receipts+abc123@in.unreceipt.com");
    expect(withForwarding.text).toContain("2. Forward email receipts");
  });

  it("escapes user-provided text in the HTML", () => {
    const email = welcome({ firstName: "<script>" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("drops pilot wording outside pilot mode", () => {
    const email = welcome({ pilotMode: false });
    expect(email.subject).toBe("Welcome to UnReceipt");
    expect(email.text).not.toMatch(/pilot/i);
  });

  it("only invites a reply when replies reach someone", () => {
    expect(welcome().text).toContain("Just reply to this email");
    expect(welcome({ canReply: false }).text).not.toContain("Just reply");
  });
});

describe("waitlistEmail", () => {
  it("confirms the signup and offers the Swedish pilot link", () => {
    const email = waitlistEmail({
      joinUrl: "https://app.unreceipt.com/app/login",
      pilotMode: true,
      canReply: true,
    });
    expect(email.subject).toBe("You're on the UnReceipt list");
    expect(email.html).toContain("Join the free pilot");
    expect(email.html).toContain('href="https://app.unreceipt.com/app/login"');
    expect(email.text).toContain("we'll email you once");
  });

  it("never promises features that don't exist yet", () => {
    const { html, text } = waitlistEmail({
      joinUrl: "https://app.unreceipt.com/app/login",
      pilotMode: true,
      canReply: false,
    });
    for (const body of [html, text]) {
      expect(body).not.toMatch(/bank|corporate card|finance dashboard|WOZ/i);
    }
  });
});

describe("firstNameFrom", () => {
  it("takes the first word of the full name", () => {
    expect(firstNameFrom("  Alex  Andersson ")).toBe("Alex");
  });
  it("returns null for missing or empty names", () => {
    expect(firstNameFrom(null)).toBeNull();
    expect(firstNameFrom("   ")).toBeNull();
  });
});

describe("signup digest helpers", () => {
  const base = {
    email: "anna@gmail.com",
    fullName: "Anna <b>Berg</b>",
    companyName: null,
    signedUpAt: new Date("2026-10-18T08:15:00Z"),
    confirmed: true,
    provider: "email",
    lastSignInAt: null,
    onboarded: true,
    photoReceipts: 0,
    emailReceipts: 0,
    ownAddresses: 0,
  };

  it("guesses a company site only for work addresses", () => {
    expect(companySiteFor("anna@gmail.com")).toBeNull();
    expect(companySiteFor("anna@Bygg-AB.se")).toBe("https://bygg-ab.se");
    expect(companySiteFor("broken")).toBeNull();
  });

  it("asks what got in the way when there's no receipt, and for feedback otherwise", () => {
    expect(signupOutreach(base).body).toContain("haven't added a receipt yet");
    const active = signupOutreach({ ...base, photoReceipts: 1 });
    expect(active.subject).toBe("Your first receipts in UnReceipt");
    expect(active.body.startsWith("Hi Anna,")).toBe(true);
  });

  it("escapes names in the HTML", () => {
    const email = signupDigestEmail({ signups: [base], moreSignups: 0, waitlist: [], totalAccounts: 1, activity });
    expect(email.html).not.toContain("<b>Berg</b>");
    expect(email.html).toContain("&lt;b&gt;Berg&lt;/b&gt;");
  });
});

describe("signupDigestEmail activity", () => {
  it("escapes the live commit title and hides the Stripe row when nothing is stuck", () => {
    const { html } = signupDigestEmail({
      signups: [],
      moreSignups: 0,
      waitlist: [],
      totalAccounts: 0,
      activity: { ...activity, liveVersion: { title: "<img src=x> fix", sha: "abc1234" } },
    });
    expect(html).toContain("&lt;img src=x&gt; fix (abc1234)");
    expect(html).not.toContain("<img src=x>");
    expect(html).not.toContain("Needs a look");
  });
});

describe("signupDigestEmail links", () => {
  const signup = {
    email: "hi?bcc=x%40evil.com&subject=y@evil.com",
    fullName: null,
    companyName: null,
    signedUpAt: new Date("2026-10-18T08:15:00Z"),
    confirmed: false,
    provider: "email",
    lastSignInAt: null,
    onboarded: false,
    photoReceipts: 0,
    emailReceipts: 0,
    ownAddresses: 0,
  };

  it("encodes addresses so they can't add mailto parameters", () => {
    const { html } = signupDigestEmail({ signups: [signup], moreSignups: 0, waitlist: [], totalAccounts: 1, activity });
    expect(html).not.toContain("mailto:hi?bcc");
    expect(html).toContain("mailto:hi%3Fbcc%3Dx%2540evil.com%26subject%3Dy%40evil.com");
  });

  it("offers no pre-filled message for an unconfirmed address", () => {
    const { html, text } = signupDigestEmail({ signups: [signup], moreSignups: 0, waitlist: [], totalAccounts: 1, activity });
    expect(html).not.toContain("Write to them");
    expect(text).toContain("Not confirmed yet");
    const ok = signupDigestEmail({ signups: [{ ...signup, email: "a@b.se", confirmed: true }], moreSignups: 0, waitlist: [], totalAccounts: 1, activity });
    expect(ok.html).toContain("Write to them");
  });
});
