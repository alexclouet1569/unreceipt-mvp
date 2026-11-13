import { describe, expect, it } from "vitest";
import { isLikelyReceipt } from "../select";

const meta = (subject: string, over: Partial<Parameters<typeof isLikelyReceipt>[0]> = {}) => ({
  subject,
  from: "shop@example.com",
  attachmentNames: [],
  hasAttachments: false,
  ...over,
});

describe("isLikelyReceipt", () => {
  it("picks receipts by subject in English, Swedish and French", () => {
    for (const s of [
      "Your receipt from Apple",
      "Kvitto för ditt köp",
      "Votre facture de novembre",
      "Order confirmation #1234",
      "Bekräftelse på din bokning",
      "Din månadsfaktura",
    ]) {
      expect(isLikelyReceipt(meta(s))).toBe(true);
    }
  });

  it("matches whole words only", () => {
    expect(isLikelyReceipt(meta("Your recurring newsletter"))).toBe(false);
    expect(isLikelyReceipt(meta("Weekly digest"))).toBe(false);
  });

  it("picks a receipt-named PDF even when the subject says nothing", () => {
    expect(isLikelyReceipt(meta("Your documents", { hasAttachments: true, attachmentNames: ["Invoice-2026-11.pdf"] }))).toBe(true);
    expect(isLikelyReceipt(meta("Holiday photos", { hasAttachments: true, attachmentNames: ["beach.pdf"] }))).toBe(false);
  });

  it("never reads our own mail or Gmail's forwarding confirmation", () => {
    expect(isLikelyReceipt(meta("Your receipt is ready", { from: "UnReceipt <hello@unreceipt.com>" }))).toBe(false);
    expect(isLikelyReceipt(meta("Gmail Forwarding Confirmation - Receive Mail from x", { from: "forwarding-noreply@google.com" }))).toBe(false);
  });
});
