import type { Locale } from "@/lib/locale";
import {
  OVERAGE_PRICE,
  OVERAGE_PRICE_SEK,
  PLANS,
  formatPrice,
  formatSek,
} from "@/lib/plans";

/**
 * Landing-page FAQ. One source for the visible FAQ section, the FAQPage
 * structured data and /llms.txt, so search engines and AI assistants see
 * exactly what visitors read. Every answer must stay true to the product.
 *
 * The English FAQ stays general and gives the short version of each
 * market's rules; the full answer belongs on that country's language page.
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
  return `One price for the whole company, no per-user fees: ${plans}. Extra receipts cost ${formatPrice(OVERAGE_PRICE)} each. Prices exclude VAT. ${trial}`;
}

function pricingAnswerSv(pilotMode: boolean): string {
  const plans = PLANS.map(
    (p) => `${p.name} ${formatSek(p.priceSek)}/mån (upp till ${p.receipts} kvitton)`
  ).join(", ");
  const trial = pilotMode
    ? "UnReceipt är gratis under piloten."
    : "Första veckan är gratis på alla planer.";
  return `Ett pris för hela företaget, inga avgifter per användare: ${plans}. Extra kvitton kostar ${formatSek(OVERAGE_PRICE_SEK)} styck. Priserna är exklusive moms. ${trial}`;
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
      a: "Every receipt is saved with its VAT amount and rate as shown on the receipt, so your accountant sees the VAT at a glance. Whether the VAT can be deducted depends on the purchase — your accountant decides that.",
    },
    {
      q: "Who checks my receipts?",
      a: "Each receipt is read automatically, then checked by our concierge within 24 hours before it's marked as verified.",
    },
    {
      q: "How long do companies have to keep receipts?",
      a: "It depends on the country. In Sweden, the Bookkeeping Act (bokföringslagen) requires keeping them until the end of the seventh year after the calendar year in which the financial year ended, stored in Sweden (or elsewhere in the EU under conditions, including notifying Skatteverket). A paper original may be thrown away once it's digitised, as long as the transfer carries no risk of the information being changed or lost; UnReceipt stores receipts in Germany, so Swedish companies notify Skatteverket of that once. In France, the Commercial Code (article L123-22) requires ten years from the end of the financial year, and a paper original may only be destroyed if the scan is a certified copy (electronic seal or signature and a timestamp). UnReceipt doesn't produce certified copies yet, so in France keep your paper originals.",
    },
    {
      q: "Can I cancel at any time?",
      a: "Yes. After you cancel, your account and receipts stay available for 90 days so you can download them — one ZIP per month, year or everything, with each receipt's original file and a PDF of every completed receipt — and we email you before anything is deleted. The duty to keep receipts stays with your company, so move them to your own archive or your accountant.",
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
      a: "UnReceipt är en kvittotjänst för småföretag i Sverige. Vidarebefordra e-postkvitton till ditt företags privata UnReceipt-adress eller fota ett papperskvitto, så blir varje kvitto inom 24 timmar ett kontrollerat underlag i din översikt: säljare, datum, kvittorader, moms och kategori.",
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
      q: "Hur hanteras momsen?",
      a: "Varje kvitto sparas med momsbelopp och momssats som de står på kvittot, så att din redovisningskonsult ser momsen direkt. Om momsen är avdragsgill beror på köpet — det avgör din redovisningskonsult.",
    },
    {
      q: "Vem kontrollerar mina kvitton?",
      a: "Varje kvitto läses automatiskt och kontrolleras sedan av vår concierge inom 24 timmar innan det markeras som kontrollerat.",
    },
    {
      q: "Hur länge måste företag spara kvitton?",
      a: "Enligt bokföringslagen ska kvitton och annan räkenskapsinformation sparas till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades. Skyldigheten ligger hos företaget, så ladda ner dina kvitton om du avslutar UnReceipt.",
    },
    {
      q: "Behöver jag spara papperskvittot?",
      a: "Nej, inte när kvittot är ordentligt digitaliserat. Sedan den 1 juli 2024 får du slänga papperskvittot när det har förts över till digital form, så länge överföringen inte innebär någon risk att uppgifterna ändras eller försvinner. Med UnReceipt behöver du bara: kontrollera att bilden är skarp och att hela kvittot syns innan du slänger det, anmäla skriftligen till Skatteverket att din räkenskapsinformation förvaras i Tyskland, där UnReceipt lagrar kvittona (en gång, och igen om platsen ändras), och ladda ner dina kvitton om du avslutar tjänsten.",
    },
    {
      q: "Kan jag avsluta när jag vill?",
      a: "Ja. När du har avslutat finns ditt konto och dina kvitton kvar i 90 dagar så att du kan ladda ner dem — en ZIP-fil per månad, år eller alltihop, med varje kvittos originalfil och en PDF för varje färdigt kvitto — och vi mejlar dig innan något raderas. Skyldigheten att spara kvittona ligger kvar hos företaget, så flytta dem till ditt eget arkiv eller till din redovisningskonsult.",
    },
    {
      q: "Var lagras min data?",
      a: "Kvitton och kontouppgifter lagras hos Supabase inom EU, i Frankfurt i Tyskland. Betalningar hanteras av Stripe — UnReceipt ser aldrig dina kortuppgifter. Läs mer på vår integritetssida.",
    },
  ];
}
