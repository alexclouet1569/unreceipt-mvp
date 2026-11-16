import { describe, expect, it } from "vitest";
import { FROM_ADDRESS } from "@/lib/email/send";
import { hasListId, isNotificationSender, isOwnEmail, OWN_SENDER_ADDRESS } from "@/lib/email/own-sender";

describe("isOwnEmail", () => {
  it("recognises the address every UnReceipt email is sent from", () => {
    expect(FROM_ADDRESS).toContain(`<${OWN_SENDER_ADDRESS}>`);
    expect(isOwnEmail(FROM_ADDRESS)).toBe(true);
    expect(isOwnEmail("hello@unreceipt.com")).toBe(true);
    expect(isOwnEmail("  HELLO@UnReceipt.com ")).toBe(true);
    expect(isOwnEmail('"UnReceipt" < hello@unreceipt.com >')).toBe(true);
  });

  it("leaves everyone else's email alone, the rest of the domain included", () => {
    // The founder's own mailbox may forward real receipts.
    expect(isOwnEmail("alex@unreceipt.com")).toBe(false);
    expect(isOwnEmail("support@unreceipt.com")).toBe(false);
    expect(isOwnEmail("hello@unreceipt.com.evil.example")).toBe(false);
    expect(isOwnEmail("receipts@uber.com")).toBe(false);
    expect(isOwnEmail("hello@unreceipt.co")).toBe(false);
  });

  it("is false without a usable address", () => {
    expect(isOwnEmail(null)).toBe(false);
    expect(isOwnEmail(undefined)).toBe(false);
    expect(isOwnEmail("")).toBe(false);
    expect(isOwnEmail("UnReceipt")).toBe(false);
  });
});

describe("isNotificationSender", () => {
  it("is GitHub's notification address only", () => {
    expect(isNotificationSender("Someone <notifications@github.com>")).toBe(true);
    expect(isNotificationSender("noreply@github.com")).toBe(false);
    expect(isNotificationSender("receipts@uber.com")).toBe(false);
    expect(isNotificationSender(null)).toBe(false);
  });
});

describe("hasListId", () => {
  it("is true only for a non-empty List-Id", () => {
    expect(hasListId(["acme/app <app.acme.github.com>"])).toBe(true);
    expect(hasListId(null)).toBe(false);
    expect(hasListId([])).toBe(false);
    expect(hasListId(["  "])).toBe(false);
  });
});
