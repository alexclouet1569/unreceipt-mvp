import { describe, expect, it } from "vitest";
import { GMAIL_ONLY_SUBJECT_WORDS, RECEIPT_SUBJECT_WORDS } from "@/lib/forwarding-filters";
import { isLikelyReceipt, MAILBOX_GENERIC_WORDS, MAILBOX_RECEIPT_WORDS } from "../select";

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
      "Din månadsfaktura",
      "Orderbekräftelse 5512",
      "Bokningsbekräftelse – Scandic",
      "Betalningsbekräftelse",
      "Tack för ditt köp",
      "Confirmation de commande n°42",
      "Confirmation de réservation",
      "Votre reçu",
      "Justificatif de paiement",
      "Thanks for your payment",
      "Your Tuesday morning trip with Uber",
    ]) {
      expect(isLikelyReceipt(meta(s))).toBe(true);
    }
  });

  it("doesn't read generic confirmations and bookings on their own", () => {
    for (const s of [
      "Appointment confirmed",
      "Bokning bekräftad",
      "Bekräftelse på din bokning",
      "Din beställning",
      "Réservation confirmée",
      "Votre commande",
      "Your order has been confirmed",
      "Vos billets",
      "Din biljett",
      "You ordered: socks",
    ]) {
      expect(isLikelyReceipt(meta(s, { from: "noreply@clinic.example" }))).toBe(false);
    }
  });

  it("reads a generic confirmation only when a receipt-named PDF comes with it", () => {
    const withPdf = (name: string) => ({ hasAttachments: true, attachmentNames: [name] });
    expect(isLikelyReceipt(meta("Bokning bekräftad", withPdf("kvitto-8812.pdf")))).toBe(true);
    expect(isLikelyReceipt(meta("Votre commande", withPdf("Facture_2026-11.pdf")))).toBe(true);
    expect(isLikelyReceipt(meta("Appointment confirmed", withPdf("kallelse.pdf")))).toBe(false);
    expect(isLikelyReceipt(meta("Your booking is confirmed", withPdf("recurring-schedule.pdf")))).toBe(false);
    // A receipt-named file that isn't a PDF doesn't count.
    expect(isLikelyReceipt(meta("Bokning bekräftad", withPdf("kvitto.docx")))).toBe(false);
  });

  it("sorts every forwarding word into the mailbox list or the generic list", () => {
    const sorted = new Set<string>([...MAILBOX_RECEIPT_WORDS, ...MAILBOX_GENERIC_WORDS]);
    for (const w of [...RECEIPT_SUBJECT_WORDS, ...GMAIL_ONLY_SUBJECT_WORDS]) {
      expect(sorted.has(w), w).toBe(true);
    }
    for (const w of MAILBOX_GENERIC_WORDS) {
      expect((MAILBOX_RECEIPT_WORDS as readonly string[]).includes(w), w).toBe(false);
    }
  });

  it("matches whole words only", () => {
    expect(isLikelyReceipt(meta("Your recurring newsletter"))).toBe(false);
    expect(isLikelyReceipt(meta("Weekly digest"))).toBe(false);
  });

  it("picks a receipt-named PDF even when the subject says nothing", () => {
    expect(isLikelyReceipt(meta("Your documents", { hasAttachments: true, attachmentNames: ["Invoice-2026-11.pdf"] }))).toBe(true);
    expect(isLikelyReceipt(meta("Holiday photos", { hasAttachments: true, attachmentNames: ["beach.pdf"] }))).toBe(false);
    expect(isLikelyReceipt(meta("Report", { hasAttachments: true, attachmentNames: ["recurring.pdf"] }))).toBe(false);
  });

  it("never reads our own mail or Gmail's forwarding confirmation", () => {
    expect(isLikelyReceipt(meta("Your receipt is ready", { from: "UnReceipt <hello@unreceipt.com>" }))).toBe(false);
    expect(isLikelyReceipt(meta("Gmail Forwarding Confirmation - Receive Mail from x", { from: "forwarding-noreply@google.com" }))).toBe(false);
  });
});
