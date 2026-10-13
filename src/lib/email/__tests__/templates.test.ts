import { describe, expect, it } from "vitest";
import { firstNameFrom, pilotWelcomeEmail, waitlistEmail } from "../templates";

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
