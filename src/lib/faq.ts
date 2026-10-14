import { PLANS, formatPrice } from "@/lib/plans";

/**
 * Landing-page FAQ. One source for the visible FAQ section, the FAQPage
 * structured data and /llms.txt, so search engines and AI assistants see
 * exactly what visitors read. Every answer must stay true to the product.
 *
 * Pure data, safe to import from client components.
 */

export type FaqItem = { q: string; a: string };

function pricingAnswer(pilotMode: boolean): string {
  const plans = PLANS.map(
    (p) => `${p.name} ${formatPrice(p.price)}/month (up to ${p.receipts} receipts)`
  ).join(", ");
  const trial = pilotMode
    ? "UnReceipt is free during the pilot."
    : "The first week is free on every plan.";
  return `One price for the whole company, no per-user fees: ${plans}. Prices exclude VAT. ${trial}`;
}

export function getFaq(pilotMode: boolean): FaqItem[] {
  return [
    {
      q: "What is UnReceipt?",
      a: "UnReceipt is a receipt service for small businesses in Sweden. Forward email receipts to your company's private UnReceipt address or snap a photo of a paper receipt, and within 24 hours each one becomes a VAT-ready record in your dashboard: merchant, date, line items, VAT and category.",
    },
    {
      q: "How do I send receipts to UnReceipt?",
      a: "Forward email receipts to your private UnReceipt address, or take a photo of a paper receipt in the app — the fields fill themselves. No bank connection or new card is needed.",
    },
    {
      q: "How much does UnReceipt cost?",
      a: pricingAnswer(pilotMode),
    },
    {
      q: "What does VAT-ready mean?",
      a: "Every receipt is saved with its VAT (moms) rate and amount split out, plus the merchant's VAT number when it's on the receipt — the details your accountant needs to deduct VAT.",
    },
    {
      q: "Who checks my receipts?",
      a: "Each receipt is read automatically, then checked by our concierge within 24 hours before it's marked as verified.",
    },
    {
      q: "How long do I have to keep receipts in Sweden?",
      a: "Under the Swedish Bookkeeping Act (bokföringslagen), receipts must be kept for seven years after the end of the calendar year in which the financial year ended. Since 1 July 2024 you may throw away the paper original once it's saved digitally in a way that keeps the information intact.",
    },
    {
      q: "Can I cancel at any time?",
      a: "Yes. Before you leave, download your receipts — every receipt has its original file and a PDF. Your account and receipts are deleted 30 days after you cancel, so move them to your own archive or your accountant first.",
    },
    {
      q: "Where is my data stored?",
      a: "Receipts and account data are stored with Supabase, hosted in the EU. Payments are handled by Stripe — UnReceipt never sees your card details. See our privacy page for the details.",
    },
    {
      q: "Is UnReceipt available outside Sweden?",
      a: "Not yet — UnReceipt is in pilot in Sweden. Leave your email on this page and we'll let you know when we open in your country.",
    },
  ];
}
