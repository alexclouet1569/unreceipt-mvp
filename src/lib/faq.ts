import type { Locale } from "@/lib/locale";
import {
  OVERAGE_PRICE,
  OVERAGE_PRICE_SEK,
  PLANS,
  formatEurFr,
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

function pricingAnswerFr(pilotMode: boolean): string {
  const plans = PLANS.map(
    (p) => `${p.name} ${formatEurFr(p.price)} HT/mois (jusqu’à ${p.receipts} reçus)`
  ).join(", ");
  const trial = pilotMode
    ? "UnReceipt est gratuit pendant la phase pilote."
    : "La première semaine est gratuite sur toutes les formules.";
  return `Un prix pour toute l’entreprise, sans frais par utilisateur\u00a0: ${plans}. Chaque reçu supplémentaire coûte ${formatEurFr(OVERAGE_PRICE)} HT. ${trial}`;
}

export function getFaq(pilotMode: boolean, locale: Locale = "en"): FaqItem[] {
  if (locale === "sv") return faqSv(pilotMode);
  if (locale === "fr") return faqFr(pilotMode);
  return faqEn(pilotMode);
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
      a: "Yes. After you cancel, your account and receipts stay available for 90 days so you can download them — every receipt has its image and a PDF — and we email you before anything is deleted. The duty to keep receipts stays with your company, so move them to your own archive or your accountant.",
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
      a: "UnReceipt är en kvittotjänst för småföretag i Sverige. Vidarebefordra e-postkvitton till ditt företags privata UnReceipt-adress eller fota ett papperskvitto, så blir varje kvitto inom 24 timmar ett kontrollerat underlag i din översikt: säljare, datum, kvittorader, moms och kategori. Appen är på engelska än så länge.",
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
      a: "Ja. När du har avslutat finns ditt konto och dina kvitton kvar i 90 dagar så att du kan ladda ner dem — varje kvitto har sin kvittobild och en PDF — och vi mejlar dig innan något raderas. Skyldigheten att spara kvittona ligger kvar hos företaget, så flytta dem till ditt eget arkiv eller till din redovisningskonsult.",
    },
    {
      q: "Var lagras min data?",
      a: "Kvitton och kontouppgifter lagras hos Supabase inom EU, i Frankfurt i Tyskland. Betalningar hanteras av Stripe — UnReceipt ser aldrig dina kortuppgifter. Läs mer på vår integritetssida.",
    },
  ];
}

function faqFr(pilotMode: boolean): FaqItem[] {
  return [
    {
      q: "Qu’est-ce qu’UnReceipt\u00a0?",
      a: "UnReceipt est un service de gestion des reçus pour les petites entreprises. Transférez vos factures et reçus envoyés par e-mail à l’adresse UnReceipt privée de votre entreprise ou photographiez un ticket papier\u00a0: sous 24 heures, chacun devient une fiche vérifiée dans votre tableau de bord — fournisseur, date, lignes, TVA et catégorie. L’application est pour l’instant en anglais.",
    },
    {
      q: "Comment envoyer mes reçus à UnReceipt\u00a0?",
      a: "Transférez vos factures et reçus envoyés par e-mail à votre adresse UnReceipt privée, ou prenez en photo un ticket papier dans l’application — les champs se remplissent tout seuls. Aucune connexion bancaire ni nouvelle carte n’est nécessaire.",
    },
    {
      q: "Combien coûte UnReceipt\u00a0?",
      a: pricingAnswerFr(pilotMode),
    },
    {
      q: "Comment la TVA est-elle gérée\u00a0?",
      a: "Chaque reçu est enregistré avec le montant et le taux de TVA tels qu’ils figurent sur le justificatif. Pour récupérer la TVA, il faut en principe une facture au nom de votre entreprise\u00a0: un simple ticket de caisse ne suffit généralement pas, et certaines dépenses (hébergement du personnel, transport de personnes…) n’ouvrent pas droit à déduction. Demandez une facture au fournisseur\u00a0; votre expert-comptable vous dira ce qui est récupérable.",
    },
    {
      q: "Qui vérifie mes reçus\u00a0?",
      a: "Chaque reçu est lu automatiquement, puis vérifié par notre équipe sous 24 heures avant d’être marqué comme vérifié.",
    },
    {
      q: "Combien de temps faut-il conserver les justificatifs\u00a0?",
      a: "Dix ans à compter de la clôture de l’exercice pour les pièces justificatives comptables des commerçants (article L123-22 du Code de commerce). Pour l’administration fiscale, les documents doivent être conservés au moins six ans (article L102 B du Livre des procédures fiscales). Cette obligation reste celle de votre entreprise\u00a0: téléchargez vos reçus si vous quittez UnReceipt.",
    },
    {
      q: "Puis-je jeter le ticket papier après l’avoir photographié\u00a0?",
      a: "Non. En France, un original papier ne peut être détruit après numérisation que si la copie est une copie fiable\u00a0: reproduction à l’identique de l’image et du contenu, sans retouche, au format PDF, avec cachet serveur ou signature électronique et horodatage (pour les factures, article A102 B-2 du Livre des procédures fiscales). UnReceipt ne produit pas ce type de copie\u00a0: conservez vos tickets et factures papier.",
    },
    {
      q: "Puis-je résilier à tout moment\u00a0?",
      a: "Oui. Après la résiliation, votre compte et vos reçus restent disponibles pendant 90 jours pour que vous puissiez les télécharger — chaque reçu a son e-mail ou sa photo d’origine et un PDF — et nous vous envoyons un e-mail avant toute suppression. L’obligation de conservation reste celle de votre entreprise\u00a0: transférez vos reçus dans votre propre archive ou à votre expert-comptable.",
    },
    {
      q: "Où sont stockées mes données\u00a0?",
      a: "Les reçus et les données du compte sont hébergés chez Supabase, dans l’UE, à Francfort (Allemagne). Les paiements sont gérés par Stripe — UnReceipt ne voit jamais vos données de carte. Plus de détails sur notre page de confidentialité (en anglais).",
    },
  ];
}
