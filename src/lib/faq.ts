import type { Locale } from "@/lib/locale";
import { PLANS, formatPrice, formatSek } from "@/lib/plans";

/**
 * Landing-page FAQ. One source for the visible FAQ section, the FAQPage
 * structured data and /llms.txt, so search engines and AI assistants see
 * exactly what visitors read. Every answer must stay true to the product.
 *
 * The English FAQ stays general; questions about one country's rules
 * belong on that country's language page.
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

function pricingAnswerSv(pilotMode: boolean): string {
  const plans = PLANS.map(
    (p) => `${p.name} ${formatSek(p.priceSek)}/mån (upp till ${p.receipts} kvitton)`
  ).join(", ");
  const trial = pilotMode
    ? "UnReceipt är gratis under piloten."
    : "Första veckan är gratis på alla planer.";
  return `Ett pris för hela företaget, inga avgifter per användare: ${plans}. Priserna är exklusive moms. ${trial}`;
}

export function getFaq(pilotMode: boolean, locale: Locale = "en"): FaqItem[] {
  return locale === "sv" ? faqSv(pilotMode) : faqEn(pilotMode);
}

function faqEn(pilotMode: boolean): FaqItem[] {
  return [
    {
      q: "What is UnReceipt?",
      a: "UnReceipt is a receipt service for small businesses. Forward email receipts to your company's private UnReceipt address or snap a photo of a paper receipt, and within 24 hours each one becomes a VAT-ready record in your dashboard: merchant, date, line items, VAT and category.",
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
      a: "Every receipt is saved with its VAT rate and amount split out, plus the merchant's VAT number when it's on the receipt — the details your accountant needs to deduct VAT.",
    },
    {
      q: "Who checks my receipts?",
      a: "Each receipt is read automatically, then checked by our concierge within 24 hours before it's marked as verified.",
    },
    {
      q: "How long do companies have to keep receipts?",
      a: "It depends on the country. In Sweden, the Bookkeeping Act (bokföringslagen) requires seven years after the end of the calendar year in which the financial year ended, and since 1 July 2024 you may throw away the paper original once it's saved digitally in a way that keeps the information intact. In France, the Commercial Code (article L123-22) requires ten years from the end of the financial year, and a paper original may only be destroyed if the scan is a certified copy (electronic seal or signature and a timestamp). UnReceipt doesn't produce certified copies yet, so in France keep your paper originals.",
    },
    {
      q: "Can I cancel at any time?",
      a: "Yes. Before you leave, download your receipts — every receipt has its original file and a PDF. Your account and receipts are deleted 30 days after you cancel, so move them to your own archive or your accountant first.",
    },
    {
      q: "Where is my data stored?",
      a: "Receipts and account data are stored with Supabase, hosted in the EU. Payments are handled by Stripe — UnReceipt never sees your card details. See our privacy page for the details.",
    },
  ];
}

function faqSv(pilotMode: boolean): FaqItem[] {
  return [
    {
      q: "Vad är UnReceipt?",
      a: "UnReceipt är en kvittotjänst för småföretag i Sverige. Vidarebefordra e-postkvitton till ert företags privata UnReceipt-adress eller fota ett papperskvitto, så blir varje kvitto inom 24 timmar ett bokföringsklart underlag i er översikt: säljare, datum, rader, moms och kategori.",
    },
    {
      q: "Hur skickar jag kvitton till UnReceipt?",
      a: "Vidarebefordra e-postkvitton till din privata UnReceipt-adress, eller ta ett foto av ett papperskvitto i appen — fälten fylls i automatiskt. Ingen bankkoppling eller nytt kort behövs.",
    },
    {
      q: "Vad kostar UnReceipt?",
      a: pricingAnswerSv(pilotMode),
    },
    {
      q: "Vad betyder bokföringsklart?",
      a: "Varje kvitto sparas med momssats och momsbelopp uppdelade, plus säljarens momsregistreringsnummer när det står på kvittot — uppgifterna din redovisningskonsult behöver för att kunna dra av momsen.",
    },
    {
      q: "Vem kontrollerar mina kvitton?",
      a: "Varje kvitto läses automatiskt och kontrolleras sedan av vår concierge inom 24 timmar innan det markeras som verifierat.",
    },
    {
      q: "Hur länge måste företag spara kvitton?",
      a: "Enligt bokföringslagen ska kvitton och annan räkenskapsinformation sparas i sju år efter utgången av det kalenderår då räkenskapsåret avslutades. Sedan den 1 juli 2024 får du slänga papperskvittot när det har sparats digitalt på ett sätt som bevarar informationen.",
    },
    {
      q: "Kan jag avsluta när jag vill?",
      a: "Ja. Ladda ner dina kvitton innan du avslutar — varje kvitto har sin originalfil och en PDF. Ditt konto och dina kvitton raderas 30 dagar efter att du har avslutat, så flytta dem till ditt eget arkiv eller till din redovisningskonsult först.",
    },
    {
      q: "Var lagras min data?",
      a: "Kvitton och kontouppgifter lagras hos Supabase inom EU. Betalningar hanteras av Stripe — UnReceipt ser aldrig dina kortuppgifter. Läs mer på vår integritetssida.",
    },
  ];
}
