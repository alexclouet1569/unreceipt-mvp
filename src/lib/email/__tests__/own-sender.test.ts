import { describe, expect, it } from "vitest";
import { FROM_ADDRESS } from "@/lib/email/send";
import { isListOrReply, isOwnEmail, OWN_SENDER_ADDRESS } from "@/lib/email/own-sender";

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

describe("isListOrReply", () => {
  it("is true for a reply or an email with a List-Id", () => {
    expect(isListOrReply({ reply: true, listIds: null })).toBe(true);
    expect(isListOrReply({ reply: false, listIds: ["acme/app <app.acme.github.com>"] })).toBe(true);
  });

  it("is false for anything else, an empty List-Id included", () => {
    expect(isListOrReply({ reply: false, listIds: null })).toBe(false);
    expect(isListOrReply({ reply: false, listIds: [] })).toBe(false);
    expect(isListOrReply({ reply: false, listIds: ["  "] })).toBe(false);
  });
});
