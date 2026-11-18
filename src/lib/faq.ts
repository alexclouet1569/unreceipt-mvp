import type { Locale } from "@/lib/locale";
import { SHOW_PRICES } from "@/lib/pricing-visibility";
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

/** The cost answer while prices are hidden (SHOW_PRICES off). */
const PRICE_HIDDEN: Record<Locale, (pilotMode: boolean) => string> = {
  en: (pilot) =>
    `One monthly price per company account, sized by how many receipts you send each month. Accounting firms need no plan of their own. ${pilot ? "UnReceipt is free during the pilot." : "The first week is free; the plans are shown before you subscribe."}`,
  sv: (pilot) =>
    `Ett månadspris per företagskonto, efter hur många kvitton ni skickar i månaden. Redovisningsbyråer behöver ingen egen plan. ${pilot ? "UnReceipt är gratis under piloten." : "Första veckan är gratis; planerna visas innan du tecknar dig."}`,
  fr: (pilot) =>
    `Un prix mensuel par compte d’entreprise, selon le nombre de reçus envoyés chaque mois. Les cabinets comptables n’ont pas besoin d’abonnement propre. ${pilot ? "UnReceipt est gratuit pendant la phase pilote." : "La première semaine est gratuite\u00a0; les formules sont présentées avant l’abonnement."}`,
};

export function getFaq(
  pilotMode: boolean,
  locale: Locale = "en",
  showPrices: boolean = SHOW_PRICES
): FaqItem[] {
  const faq = locale === "sv" ? faqSv(pilotMode) : locale === "fr" ? faqFr(pilotMode) : faqEn(pilotMode);
  if (showPrices) return faq;
  // The cost question is always third; keep the question, drop the prices.
  return faq.map((item, i) => (i === 2 ? { q: item.q, a: PRICE_HIDDEN[locale](pilotMode) } : item));
}

function faqEn(pilotMode: boolean): FaqItem[] {
  return [
    {
      q: "What is UnReceipt?",
      a: "UnReceipt is a receipt service for small businesses, freelancers and their accounting firms. Snap a photo of a paper receipt, forward email receipts to your company's private UnReceipt address or connect your Gmail or Outlook. AI reads a photo in seconds and an email receipt as soon as it arrives, and each one becomes a VAT-ready record in your dashboard (merchant, date, line items, VAT and category) that you check and confirm.",
    },
    {
      q: "How do I send receipts to UnReceipt?",
      a: "Forward email receipts to your private UnReceipt address, connect your Gmail or Outlook so they arrive on their own, or take a photo of a paper receipt in the app — the fields fill themselves. No bank connection or new card is needed.",
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
      a: "You do. AI reads each receipt and fills in the fields: a photo in a few seconds, an email receipt as soon as it arrives. You check the fields and confirm; email receipts wait in Review needed until you have. Your accountant can complete and correct them too.",
    },
    {
      q: "Can my accountant see my receipts?",
      a: "Yes. Invite your accountant from Settings in the app; once they accept with their work email, they see your company's receipts in UnReceipt's accounting-firm portal, can complete and check them, and export each month for the bookkeeping. You can also download a ZIP for any month and send it yourself.",
    },
    {
      q: "Can employees send their receipts?",
      a: "Yes. The owner invites employees by email under Team; they snap or forward their receipts and send them for approval, saying whether they paid with their own money or the company's card. The owner, or the approver chosen for that person, approves, sends back or rejects. Approved outlays paid with an employee's own money are listed per person to pay back (there is no payout or payroll file), and the accountant sees an employee's receipt only once it's approved. The team feature is new and in pilot.",
    },
    {
      q: "How long do companies have to keep receipts?",
      a: "It depends on the country. In Sweden, the Bookkeeping Act (bokföringslagen) requires keeping them until the end of the seventh year after the calendar year in which the financial year ended, stored in Sweden (or elsewhere in the EU under conditions, including notifying Skatteverket). A paper original may be thrown away once it's digitised, as long as the transfer carries no risk of the information being changed or lost; UnReceipt stores receipts in Germany, so Swedish companies notify Skatteverket of that once, and again if the location changes. In France, the Commercial Code (article L123-22) requires traders and companies to keep them ten years from the end of the financial year (the tax code's six years also becomes ten for documents still within the six-year period on 1 January 2027), and a paper invoice may only be destroyed if the scan is a compliant copy under article A102 B-2 of the tax procedures code (an untouched image in a sealed or signed, timestamped PDF). UnReceipt doesn't produce such copies yet, so in France keep your paper originals.",
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
      a: "UnReceipt är en kvittotjänst för småföretag i Sverige. Fota ett papperskvitto, vidarebefordra e-postkvitton till ditt företags privata UnReceipt-adress eller anslut Gmail eller Outlook. AI läser av ett foto på några sekunder och ett e-postkvitto så fort det kommer, och varje kvitto blir ett underlag i din översikt (säljare, datum, kvittorader, moms och kategori) som du ser över och bekräftar. Appen är på engelska än så länge.",
    },
    {
      q: "Hur skickar jag kvitton till UnReceipt?",
      a: "Vidarebefordra e-postkvitton till din privata UnReceipt-adress, anslut Gmail eller Outlook så kommer de av sig själva, eller ta ett foto av ett papperskvitto i appen — fälten fylls i automatiskt. Ingen bankkoppling eller nytt kort behövs.",
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
      a: "Det gör du. AI läser av kvittot och fyller i fälten: ett foto på några sekunder, ett e-postkvitto så fort det kommer. Du ser över fälten och bekräftar; e-postkvitton väntar under Review needed tills du har gjort det. Din redovisningskonsult kan också komplettera och rätta dem.",
    },
    {
      q: "Kan min redovisningsbyrå se mina kvitton?",
      a: "Ja. Bjud in din redovisningskonsult under Settings i appen; när hen accepterar med sin jobbmejl ser byrån ditt företags kvitton i UnReceipts byråportal, kan komplettera och kontrollera dem och exportera varje månad till bokföringen, med förslag på BAS-konto. Du kan också ladda ner en ZIP för valfri månad och skicka den själv.",
    },
    {
      q: "Kan de anställda skicka in sina kvitton?",
      a: "Ja. Ägaren bjuder in de anställda via mejl under Team; de fotar eller vidarebefordrar sina kvitton och skickar dem för godkännande, med uppgift om de betalade med egna pengar eller med företagets kort. Ägaren, eller den godkännare som valts för personen, godkänner, skickar tillbaka eller avvisar. Godkända utlägg som en anställd betalat själv listas per person att betala tillbaka (det finns ingen utbetalning eller lönefil), och redovisningsbyrån ser en anställds kvitto först när det är godkänt. Teamfunktionen är ny och ingår i piloten.",
    },
    {
      q: "Hur länge måste företag spara kvitton?",
      a: "Enligt bokföringslagen ska kvitton och annan räkenskapsinformation sparas till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades. Skyldigheten ligger hos företaget, så ladda ner dina kvitton om du avslutar UnReceipt.",
    },
    {
      q: "Behöver jag spara papperskvittot?",
      a: "Nej, inte när kvittot är ordentligt digitaliserat. Sedan den 1 juli 2024 får du slänga papperskvittot när det har förts över till digital form, så länge överföringen inte innebär någon risk att uppgifterna ändras eller försvinner. Med UnReceipt gör du så här: kontrollera i UnReceipt efter att du sparat att bilden är skarp och att hela kvittot syns innan du slänger det, anmäla skriftligen till Skatteverket att din räkenskapsinformation förvaras i Tyskland, där UnReceipt lagrar kvittona (en gång, och igen om platsen ändras), och ladda ner dina kvitton om du avslutar tjänsten.",
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

function faqFr(pilotMode: boolean): FaqItem[] {
  return [
    {
      q: "Qu’est-ce qu’UnReceipt\u00a0?",
      a: "UnReceipt est un service de gestion des reçus pour les petites entreprises. Photographiez un ticket papier, transférez vos factures et reçus envoyés par e-mail à l’adresse UnReceipt privée de votre entreprise, ou connectez Gmail ou Outlook. L’IA lit une photo en quelques secondes et un reçu par e-mail dès son arrivée\u00a0: chacun devient une fiche dans votre tableau de bord — fournisseur, date, lignes, TVA et catégorie — que vous vérifiez et confirmez. L’application est pour l’instant en anglais.",
    },
    {
      q: "Comment envoyer mes reçus à UnReceipt\u00a0?",
      a: "Transférez vos factures et reçus envoyés par e-mail à votre adresse UnReceipt privée, connectez Gmail ou Outlook pour qu’ils arrivent tout seuls, ou prenez en photo un ticket papier dans l’application — les champs se remplissent tout seuls. Aucune connexion bancaire ni nouvelle carte n’est nécessaire.",
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
      a: "Vous. L’IA lit chaque reçu et remplit les champs\u00a0: une photo en quelques secondes, un reçu par e-mail dès son arrivée. Vous vérifiez les champs et vous confirmez\u00a0; les reçus par e-mail attendent dans «\u00a0Review needed\u00a0» jusque-là. Votre expert-comptable peut aussi les compléter et les corriger.",
    },
    {
      q: "Mon expert-comptable peut-il voir mes reçus\u00a0?",
      a: "Oui. Invitez votre expert-comptable depuis les réglages de l’application (Settings)\u00a0; une fois qu’il accepte avec son e-mail professionnel, il voit les reçus de votre entreprise dans le portail cabinet d’UnReceipt, peut les compléter et les vérifier, et exporter chaque mois pour la saisie. Vous pouvez aussi télécharger un ZIP pour n’importe quel mois et l’envoyer vous-même.",
    },
    {
      q: "Mes salariés peuvent-ils envoyer leurs reçus\u00a0?",
      a: "Oui. Le dirigeant invite ses salariés par e-mail dans Team\u00a0; ils photographient ou transfèrent leurs reçus et les envoient pour validation, en indiquant s’ils ont payé eux-mêmes ou avec la carte de l’entreprise. Le dirigeant, ou le valideur choisi pour cette personne, valide, renvoie ou refuse. Les frais validés payés par un salarié de sa poche sont listés par personne à rembourser (il n’y a ni virement ni fichier de paie), et l’expert-comptable ne voit le reçu d’un salarié qu’une fois validé. La gestion d’équipe est nouvelle et en phase pilote.",
    },
    {
      q: "Combien de temps faut-il conserver les justificatifs\u00a0?",
      a: "Dix ans à compter de la clôture de l’exercice pour les pièces justificatives comptables des commerçants (article L123-22 du Code de commerce). Pour l’administration fiscale, le délai est aujourd’hui de six ans (article L102 B du Livre des procédures fiscales) et passe à dix ans pour les documents dont la conservation expire après le 1er janvier 2027 (loi n° 2026-534 du 25 juin 2026). Cette obligation reste celle de votre entreprise\u00a0: téléchargez vos reçus si vous quittez UnReceipt.",
    },
    {
      q: "Puis-je jeter le ticket papier après l’avoir photographié\u00a0?",
      a: "Non. En France, une facture papier ne peut être détruite après numérisation que si la copie est conforme à l’original en image et en contenu (article A102 B-2 du Livre des procédures fiscales)\u00a0: reproduction à l’identique, sans traitement de l’image, au format PDF, avec cachet serveur, empreinte numérique ou signature électronique, et horodatage. UnReceipt ne produit pas ce type de copie\u00a0: conservez vos tickets et factures papier.",
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
