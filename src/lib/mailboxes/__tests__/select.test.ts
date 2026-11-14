import { describe, expect, it } from "vitest";
import { GMAIL_ONLY_SUBJECT_WORDS, RECEIPT_SUBJECT_WORDS } from "@/lib/forwarding-filters";
import { isLikelyReceipt, isReply, MAILBOX_GENERIC_WORDS, MAILBOX_RECEIPT_WORDS } from "../select";

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

  // The first real mailbox (2026-11-14): 27 emails were imported, 4 were
  // receipts. The other 23 talked about receipts. Subjects shortened, the
  // shape kept.
  describe("the first real mailbox", () => {
    const receipts = [
      "Your receipt from Anthropic, PBC #2024-4081-4698",
      "Your receipt from Wispr AI, Inc. (dba Wispr Flow) #1234-5678",
      "Your receipt from Firecrawl #2015-0307",
    ];
    const notReceipts: Array<[string, Partial<Parameters<typeof isLikelyReceipt>[0]>]> = [
      // GitHub replies and notifications about pull requests whose titles
      // mention receipts.
      ["Re: [alexclouet1569/unreceipt-mvp] Faster home load and lighter receipt rows (PR #143)", { from: "alexclouet1569 <notifications@github.com>", listId: "alexclouet1569/unreceipt-mvp <unreceipt-mvp.alexclouet1569.github.com>" }],
      ["Re: [alexclouet1569/unreceipt-mvp] Receipts keep their printed day everywhere (PR #139)", { from: "Vercel <notifications@github.com>" }],
      ["[alexclouet1569/unreceipt-mvp] Receipt reading: faster and cheaper (PR #120)", { from: "x <notifications@github.com>" }],
      ["[team] Digital receipt redesign", { from: "lists@example.org", listId: "<team.lists.example.org>" }],
      // A conversation with an accountant about receipts.
      ["Sv: Question about how you collect receipts from clients", { from: "Byrå <anna@byra.se>" }],
      ["SV: Question about how you collect receipts from clients", { from: "Byrå <anna@byra.se>" }],
      ["Question about how you collect receipts from clients", { from: "me@example.com" }],
      // French "reçu" as the verb.
      ['Vous avez reçu un courrier " RDV entretien " dans votre espace', { from: "noreply@service-public.example" }],
      ["Vous avez recu un nouveau message", { from: "noreply@example.fr" }],
    ];

    it("keeps the receipts", () => {
      for (const s of receipts) expect(isLikelyReceipt(meta(s, { from: "invoice+statements@stripe.com" })), s).toBe(true);
    });

    it("leaves out conversations, lists and notifications about receipts", () => {
      for (const [s, over] of notReceipts) expect(isLikelyReceipt(meta(s, over)), s).toBe(false);
    });

    it("still reads a reply or a list email that carries a receipt PDF", () => {
      const pdf = { hasAttachments: true, attachmentNames: ["Receipt-2208.pdf"] };
      expect(isLikelyReceipt(meta("Re: your order", pdf))).toBe(true);
      expect(isLikelyReceipt(meta("Monthly statement", { ...pdf, listId: "<billing.example.com>" }))).toBe(true);
    });

    it("never reads GitHub notifications, even with a PDF", () => {
      expect(
        isLikelyReceipt(meta("[org/repo] Invoice export", { from: "notifications@github.com", hasAttachments: true, attachmentNames: ["invoice.pdf"] })),
      ).toBe(false);
    });

    it("keeps forwarded receipts", () => {
      expect(isLikelyReceipt(meta("Fwd: Your receipt from Apple"))).toBe(true);
      expect(isLikelyReceipt(meta("TR: Votre facture de novembre"))).toBe(true);
      expect(isLikelyReceipt(meta("VB: Kvitto för ditt köp"))).toBe(true);
    });

    it("reads French receipt phrases but not the verb", () => {
      for (const s of ["Votre reçu", "Votre recu Uber", "Reçu de paiement n°42", "Reçu fiscal 2026", "Reçu n° 1182"]) {
        expect(isLikelyReceipt(meta(s)), s).toBe(true);
      }
      for (const s of ["Vous avez reçu un document", "Bien reçu, merci", "Nous avons reçu votre demande"]) {
        expect(isLikelyReceipt(meta(s)), s).toBe(false);
      }
    });

    it("doesn't select plurals on their own", () => {
      for (const s of ["How we handle receipts", "Dina kvitton", "Vos factures", "About invoices"]) {
        expect(isLikelyReceipt(meta(s)), s).toBe(false);
      }
    });
  });

  it("recognises reply prefixes, not forwards", () => {
    for (const s of ["Re: x", "RE[2]: x", "Sv: x", "SV:x", "Svar: x", "AW: x", "Antw: x", "Réf : x", "Ref: x", "Rif: x", "VS: x", "Odp: x"]) {
      expect(isReply(s), s).toBe(true);
    }
    for (const s of ["Fwd: x", "FW: x", "TR: x", "VB: x", "Receipt", "Rechnung", "Svenska kvitton"]) {
      expect(isReply(s), s).toBe(false);
    }
  });

  it("stays fast on a subject made to backtrack", () => {
    const started = Date.now();
    expect(isReply("re" + " ".repeat(1_000_000) + "x")).toBe(false);
    expect(isLikelyReceipt(meta("re" + " ".repeat(1_000_000) + "x"))).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
