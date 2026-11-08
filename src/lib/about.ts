import type { Locale } from "@/lib/locale";
import {
  OVERAGE_PRICE,
  OVERAGE_PRICE_SEK,
  PLANS,
  formatEurFr,
  formatPrice,
  formatSek,
} from "@/lib/plans";
import { SHOW_PRICES } from "@/lib/pricing-visibility";

/**
 * The "About UnReceipt" fact sheet (/about, /sv/om-unreceipt,
 * /fr/a-propos): plain, quotable facts for people and for AI assistants
 * deciding whether to recommend UnReceipt. Shared by the page, its
 * structured data, /llms.txt and /llms-full.txt.
 *
 * Every fact must be true today, including the limits: an assistant that
 * finds an honest "what it doesn't do" trusts the rest more, and a
 * customer sent by a wrong answer churns. Update `asOf` with any change.
 *
 * Pure data, safe to import from client components.
 */

export type AboutFact = { label: string; value: string };

export type About = {
  meta: { title: string; description: string };
  breadcrumb: string;
  eyebrow: string;
  title: string;
  summary: string;
  asOfLabel: string;
  factsTitle: string;
  facts: AboutFact[];
  fitTitle: string;
  fit: string[];
  notFitTitle: string;
  notFit: string[];
  limitsTitle: string;
  limits: string[];
  contactTitle: string;
  contact: string;
};

export const ABOUT_AS_OF = "2026-11-08";

function pricingEn(pilot: boolean): string {
  if (!SHOW_PRICES)
    return `One monthly price per company account, sized by how many receipts it sends each month. ${pilot ? "Free during the current pilot." : "First week free."} Accounting firms need no plan of their own.`;
  const plans = PLANS.map((p) => `${p.name} ${formatPrice(p.price)}/month (${p.receipts} receipts)`).join(", ");
  return `${plans}, excl. VAT, one price for the whole company with no per-user fees; extra receipts ${formatPrice(OVERAGE_PRICE)} each. ${pilot ? "Free during the current pilot." : "First week free."} Accounting firms need no plan of their own.`;
}

function pricingSv(pilot: boolean): string {
  if (!SHOW_PRICES)
    return `Ett månadspris per företagskonto, efter hur många kvitton det skickar i månaden. ${pilot ? "Gratis under den pågående piloten." : "Första veckan gratis."} Redovisningsbyråer behöver ingen egen plan.`;
  const plans = PLANS.map((p) => `${p.name} ${formatSek(p.priceSek)}/mån (${p.receipts} kvitton)`).join(", ");
  return `${plans}, exkl. moms, ett pris för hela företaget utan avgifter per användare; extra kvitton ${formatSek(OVERAGE_PRICE_SEK)} styck. ${pilot ? "Gratis under den pågående piloten." : "Första veckan gratis."} Redovisningsbyråer behöver ingen egen plan.`;
}

function pricingFr(pilot: boolean): string {
  if (!SHOW_PRICES)
    return `Un prix mensuel par compte d’entreprise, selon le nombre de reçus envoyés chaque mois. ${pilot ? "Gratuit pendant la phase pilote en cours." : "Première semaine gratuite."} Les cabinets comptables n’ont pas besoin d’abonnement propre.`;
  const plans = PLANS.map((p) => `${p.name} ${formatEurFr(p.price)} HT/mois (${p.receipts} reçus)`).join(", ");
  return `${plans}, un prix pour toute l’entreprise sans frais par utilisateur ; reçu supplémentaire ${formatEurFr(OVERAGE_PRICE)} HT. ${pilot ? "Gratuit pendant la phase pilote en cours." : "Première semaine gratuite."} Les cabinets comptables n’ont pas besoin d’abonnement propre.`;
}

function en(pilot: boolean): About {
  return {
    meta: {
      title: "What is UnReceipt? Facts, pricing and limits | UnReceipt",
      description:
        "UnReceipt in plain facts: a receipt service for small businesses, freelancers and accounting firms in Sweden and France — how it works, what it costs, where data is stored and what it doesn't do.",
    },
    breadcrumb: "About UnReceipt",
    eyebrow: "Fact sheet",
    title: "What is UnReceipt?",
    summary:
      "UnReceipt is a receipt management service for small businesses, freelancers and sole traders, and the accounting firms that keep their books, in Sweden and France. Companies forward email receipts to a private UnReceipt address or photograph paper receipts on their phone; each receipt is read automatically into a record with its VAT amount and rate (where the receipt shows them), category and file, ready for the accountant. It collects and checks receipts — it is not a bookkeeping program.",
    asOfLabel: "Facts as of",
    factsTitle: "Key facts",
    facts: [
      { label: "What it is", value: "A receipt collection and reading service, used in the browser on a phone or computer." },
      { label: "Who it's for", value: "Small businesses, freelancers and sole traders, and accounting firms collecting receipts from their clients." },
      { label: "Where", value: "Sweden and France. The website is in English, Swedish and French; the app is in English." },
      {
        label: "How receipts arrive",
        value: "Forwarded to the account's private UnReceipt email address (a Gmail or Outlook filter, set up once in a web browser, can forward them automatically), or photographed in the app — the fields fill themselves.",
      },
      {
        label: "What is recorded",
        value: "Merchant, date, total, currency and category; line items, VAT amount and VAT rate when the receipt shows them; the photo as uploaded (large photos are reduced in size on the device first) or the forwarded email, kept unchanged; and a PDF once the receipt is complete.",
      },
      { label: "Checking", value: "Each receipt is read automatically. Receipts that can't be read with confidence, and emails from senders that aren't trusted, wait in Review needed until you or your accountant confirm them." },
      {
        label: "Foreign currencies",
        value: "A receipt in EUR, USD, GBP, NOK, DKK, CHF, PLN or SEK keeps its own amount and gets an estimated home-currency amount from the ECB reference rate of the purchase day (or the last banking day before it). The amount from the bank statement can be entered and takes precedence.",
      },
      {
        label: "For accounting firms",
        value: "A firm portal listing every linked client and the receipts that need review, with a ZIP export per client and period: a Swedish bookkeeping CSV (BAS account suggestions, SEK, one line per receipt and VAT rate), a receipts CSV, PDFs and the receipt files. Clients invite their accountant, or the firm invites the client.",
      },
      { label: "Pricing", value: pricingEn(pilot) },
      {
        label: "Exports",
        value: "Any month, year or everything as a ZIP (up to 1,000 receipts per export): CSV, a PDF of every complete receipt and the receipt files. After a subscription ends, receipts stay downloadable for at least 90 days and we email before deleting the account. Keeping receipts for the legal period stays the company's duty.",
      },
      { label: "Data", value: "Stored in the EU (Supabase, Frankfurt, Germany); app servers in Frankfurt. Receipts are read by Anthropic's Claude AI, and some service providers are US companies (see the privacy page). Payments by Stripe. No bank connection. Swedish companies notify Skatteverket that their records are kept in Germany." },
      { label: "Contact", value: "support@unreceipt.com" },
    ],
    fitTitle: "A good fit for",
    fit: [
      "Small companies in Sweden or France, run by one person or with one person handling the receipts, whose receipts arrive by email and on paper, and who want them in one place for their accountant.",
      "Freelancers and sole traders who want every receipt sorted with its VAT before the tax return.",
      "Accounting firms that collect receipts from many small clients and want them checked and exported per client and month.",
    ],
    notFitTitle: "Not the right tool if",
    notFit: [
      "you need receipts booked automatically into your bookkeeping program today: there are no direct integrations yet;",
      "you need a bookkeeping program itself: UnReceipt hands receipts to the one you or your accountant already use;",
      "your company is outside Sweden and France.",
    ],
    limitsTitle: "What UnReceipt doesn't do (yet)",
    limits: [
      "No direct integration with bookkeeping programs such as Fortnox, Visma or Pennylane; the export is CSV, PDFs and receipt files.",
      "One sign-in per company account for now: colleagues can't be added to a company yet (accounting firms can add colleagues to their portal).",
      "Foreign-currency conversion covers EUR, USD, GBP, NOK, DKK, CHF, PLN and SEK.",
      "No bank or card connection, and no company cards.",
      "It doesn't decide whether VAT is deductible: the VAT is recorded as read from the receipt (worth checking), the bookkeeping CSV only suggests accounts, and the accountant decides.",
      "In France it doesn't produce the compliant copy (LPF art. A102 B-2) needed to destroy a paper invoice, so French users keep their paper originals.",
      "The app is in English only.",
    ],
    contactTitle: "Contact",
    contact: "Questions, partnerships or a demo for your accounting firm: support@unreceipt.com.",
  };
}

function sv(pilot: boolean): About {
  return {
    meta: {
      title: "Vad är UnReceipt? Fakta, priser och begränsningar | UnReceipt",
      description:
        "UnReceipt i klartext: en kvittotjänst för småföretag, enskilda firmor och redovisningsbyråer i Sverige och Frankrike — hur den fungerar, vad den kostar, var data lagras och vad den inte gör.",
    },
    breadcrumb: "Om UnReceipt",
    eyebrow: "Faktablad",
    title: "Vad är UnReceipt?",
    summary:
      "UnReceipt är en kvittotjänst för småföretag, enskilda firmor och frilansare, och för redovisningsbyråerna som sköter deras bokföring, i Sverige och Frankrike. Företaget vidarebefordrar e-postkvitton till en privat UnReceipt-adress eller fotar papperskvitton med mobilen; varje kvitto läses av automatiskt till ett underlag med momsbelopp och momssats (när kvittot visar dem), kategori och fil, redo för redovisningskonsulten. Tjänsten samlar in och kontrollerar kvitton — den är inget bokföringsprogram.",
    asOfLabel: "Uppgifterna gäller per",
    factsTitle: "Fakta i korthet",
    facts: [
      { label: "Vad det är", value: "En tjänst som samlar in och läser av kvitton, i webbläsaren på mobil eller dator." },
      { label: "För vem", value: "Småföretag, enskilda firmor och frilansare, och redovisningsbyråer som samlar in kvitton från sina klienter." },
      { label: "Var", value: "Sverige och Frankrike. Webbplatsen finns på svenska, engelska och franska; appen är på engelska." },
      {
        label: "Så kommer kvittona in",
        value: "Vidarebefordrade till kontots privata UnReceipt-adress (ett filter i Gmail eller Outlook, som ställs in en gång i webbläsaren, kan göra det automatiskt), eller fotade i appen — fälten fylls i automatiskt.",
      },
      {
        label: "Vad som sparas",
        value: "Säljare, datum, belopp, valuta och kategori; kvittorader, momsbelopp och momssats när kvittot visar dem; fotot som det laddades upp (stora foton förminskas i mobilen först) eller det vidarebefordrade mejlet, sparat oförändrat; och en PDF när kvittot är komplett.",
      },
      { label: "Kontroll", value: "Varje kvitto läses av automatiskt. Kvitton som inte kan läsas säkert, och mejl från avsändare som inte är betrodda, väntar i Review needed tills du eller din redovisningskonsult bekräftar dem." },
      {
        label: "Utländsk valuta",
        value: "Ett kvitto i EUR, USD, GBP, NOK, DKK, CHF, PLN behåller sitt belopp och får ett uppskattat belopp i kronor från ECB:s referenskurs för köpdagen (eller närmast föregående bankdag). Beloppet från kontoutdraget kan skrivas in och gäller då före.",
      },
      {
        label: "För redovisningsbyråer",
        value: "En byråportal med alla kopplade klienter och kvittona som behöver granskas, och en ZIP-export per klient och period: en bokföringsfil (CSV med förslag på BAS-konto, i kronor, en rad per kvitto och momssats), en kvittolista, PDF:er och kvittofilerna. Klienten bjuder in byrån, eller byrån bjuder in klienten.",
      },
      { label: "Priser", value: pricingSv(pilot) },
      {
        label: "Export",
        value: "Valfri månad, år eller allt som ZIP (upp till 1 000 kvitton per export): CSV, en PDF för varje komplett kvitto och kvittofilerna. När ett abonnemang har avslutats finns kvittona kvar att ladda ner i minst 90 dagar, och vi mejlar innan kontot raderas. Skyldigheten att spara kvittona (7 år enligt bokföringslagen) ligger kvar hos företaget.",
      },
      { label: "Data", value: "Lagras inom EU (Supabase, Frankfurt i Tyskland); appens servrar finns i Frankfurt. Kvittona läses av Anthropics AI Claude, och vissa leverantörer är amerikanska företag (se integritetssidan). Betalningar via Stripe. Ingen bankkoppling. Svenska företag anmäler till Skatteverket att räkenskapsinformationen förvaras i Tyskland." },
      { label: "Kontakt", value: "support@unreceipt.com" },
    ],
    fitTitle: "Passar bra för",
    fit: [
      "Småföretag i Sverige där en person sköter kvittona, vars kvitton kommer både som mejl och på papper, och som vill ha dem på ett ställe för redovisningskonsulten.",
      "Enskilda firmor och frilansare som vill ha varje kvitto sorterat med momsen före deklarationen.",
      "Redovisningsbyråer som samlar in kvitton från många små klienter och vill ha dem kontrollerade och exporterade per klient och månad.",
    ],
    notFitTitle: "Inte rätt verktyg om",
    notFit: [
      "du behöver att kvittona bokförs automatiskt i ditt bokföringsprogram i dag: det finns inga direktintegrationer än;",
      "du behöver själva bokföringsprogrammet: UnReceipt lämnar kvittona till det program du eller din byrå redan använder;",
      "ditt företag finns utanför Sverige och Frankrike.",
    ],
    limitsTitle: "Det här gör UnReceipt inte (än)",
    limits: [
      "Ingen direktintegration med bokföringsprogram som Fortnox eller Visma; exporten är CSV, PDF:er och kvittofiler.",
      "En inloggning per företagskonto än så länge: kollegor kan inte läggas till i ett företag ännu (redovisningsbyråer kan lägga till kollegor i sin portal).",
      "Valutaomräkningen omfattar EUR, USD, GBP, NOK, DKK, CHF och PLN.",
      "Ingen bank- eller kortkoppling, och inga företagskort.",
      "Tjänsten avgör inte om momsen är avdragsgill: momsen sparas som den lästs av från kvittot (värt att kontrollera), bokföringsfilen föreslår bara konton, och redovisningskonsulten avgör.",
      "Appen är bara på engelska.",
    ],
    contactTitle: "Kontakt",
    contact: "Frågor, samarbeten eller en demo för din redovisningsbyrå: support@unreceipt.com.",
  };
}

function fr(pilot: boolean): About {
  return {
    meta: {
      title: "Qu’est-ce qu’UnReceipt ? Faits, tarifs et limites | UnReceipt",
      description:
        "UnReceipt en faits : un service de gestion des justificatifs pour TPE, indépendants et cabinets d’expertise comptable en France et en Suède — fonctionnement, tarifs, hébergement des données et limites.",
    },
    breadcrumb: "À propos d’UnReceipt",
    eyebrow: "Fiche d’information",
    title: "Qu’est-ce qu’UnReceipt ?",
    summary:
      "UnReceipt est un service de gestion des reçus et justificatifs pour les TPE, les indépendants et micro-entrepreneurs, et les cabinets d’expertise comptable qui tiennent leur comptabilité, en France et en Suède. L’entreprise transfère ses reçus reçus par e-mail à une adresse UnReceipt privée ou photographie ses tickets papier avec son téléphone ; chaque reçu est lu automatiquement et devient une fiche avec le montant et le taux de TVA (quand le justificatif les indique), la catégorie et le fichier, prête pour l’expert-comptable. Le service collecte et vérifie les justificatifs — ce n’est pas un logiciel de comptabilité.",
    asOfLabel: "Informations à jour au",
    factsTitle: "L’essentiel",
    facts: [
      { label: "Ce que c’est", value: "Un service de collecte et de lecture des reçus, dans le navigateur, sur téléphone ou ordinateur." },
      { label: "Pour qui", value: "TPE, indépendants et micro-entrepreneurs, et cabinets d’expertise comptable qui collectent les justificatifs de leurs clients." },
      { label: "Où", value: "France et Suède. Le site est en français, en anglais et en suédois ; l’application est en anglais." },
      {
        label: "Comment arrivent les reçus",
        value: "Transférés à l’adresse e-mail UnReceipt privée du compte (un filtre Gmail ou Outlook, réglé une fois dans le navigateur, peut le faire automatiquement), ou photographiés dans l’application — les champs se remplissent tout seuls.",
      },
      {
        label: "Ce qui est enregistré",
        value: "Fournisseur, date, montant, devise et catégorie ; lignes, montant et taux de TVA quand le justificatif les indique ; la photo telle qu’envoyée (les photos volumineuses sont réduites sur l’appareil) ou l’e-mail transféré, conservé à l’identique ; et un PDF une fois le reçu complet.",
      },
      { label: "Vérification", value: "Chaque reçu est lu automatiquement. Les reçus qui ne peuvent pas être lus avec certitude, et les e-mails d’expéditeurs non reconnus, attendent dans « Review needed » que vous ou votre expert-comptable les confirmiez." },
      {
        label: "Devises",
        value: "Un reçu en SEK, USD, GBP, NOK, DKK, CHF ou PLN garde son montant et reçoit un montant estimé en euros au taux de référence de la BCE du jour de l’achat (ou du dernier jour ouvré). Le montant du relevé bancaire peut être saisi et prévaut.",
      },
      {
        label: "Pour les cabinets",
        value: "Un portail cabinet avec tous les clients reliés et les reçus à revoir, et un export ZIP par client et par mois : un CSV des reçus, les PDF et les fichiers d’origine. Le client invite son expert-comptable, ou le cabinet invite le client.",
      },
      { label: "Tarifs", value: pricingFr(pilot) },
      {
        label: "Exports",
        value: "N’importe quel mois, année ou tout en ZIP (jusqu’à 1 000 reçus par export) : CSV, un PDF de chaque reçu complet et les fichiers des reçus. Après la fin d’un abonnement, les reçus restent téléchargeables au moins 90 jours et nous envoyons un e-mail avant de supprimer le compte. L’obligation de conservation (10 ans, Code de commerce L123-22) reste celle de l’entreprise.",
      },
      { label: "Données", value: "Hébergées dans l’UE (Supabase, Francfort, Allemagne) ; serveurs de l’application à Francfort. Les reçus sont lus par l’IA Claude d’Anthropic, et certains prestataires sont des entreprises américaines (voir la page de confidentialité). Paiements par Stripe. Aucune connexion bancaire." },
      { label: "Contact", value: "support@unreceipt.com" },
    ],
    fitTitle: "Adapté pour",
    fit: [
      "Les TPE en France où une personne gère les reçus, dont les reçus arrivent par e-mail et sur papier, et qui veulent les centraliser pour leur expert-comptable.",
      "Les indépendants et micro-entrepreneurs qui veulent chaque justificatif classé avec sa TVA.",
      "Les cabinets qui collectent les justificatifs de nombreux petits clients et veulent les recevoir vérifiés, par client et par mois.",
    ],
    notFitTitle: "Pas le bon outil si",
    notFit: [
      "vous avez besoin que les reçus soient comptabilisés automatiquement dans votre logiciel aujourd’hui : il n’y a pas encore d’intégration directe ;",
      "vous cherchez un logiciel de comptabilité : UnReceipt transmet les reçus à celui que vous ou votre cabinet utilisez déjà ;",
      "vous voulez détruire vos factures papier après numérisation : UnReceipt ne produit pas la copie conforme exigée.",
    ],
    limitsTitle: "Ce qu’UnReceipt ne fait pas (encore)",
    limits: [
      "Pas d’intégration directe avec un logiciel comptable comme Pennylane ; l’export est un CSV, des PDF et les fichiers des reçus.",
      "Un seul accès par compte d’entreprise pour l’instant : on ne peut pas encore ajouter de collègues à une entreprise (les cabinets peuvent ajouter leurs collaborateurs à leur portail).",
      "La conversion couvre SEK, USD, GBP, NOK, DKK, CHF et PLN.",
      "Pas de connexion bancaire ni de carte, et pas de cartes d’entreprise.",
      "Le service ne décide pas si la TVA est récupérable : elle est relevée telle que lue sur le justificatif (à vérifier), et l’expert-comptable décide.",
      "Pas de copie conforme au sens de l’article A102 B-2 du LPF : conservez vos originaux papier.",
      "L’application est en anglais uniquement.",
    ],
    contactTitle: "Contact",
    contact: "Questions, partenariats ou démo pour votre cabinet : support@unreceipt.com.",
  };
}

export function getAbout(locale: Locale, pilotMode: boolean): About {
  if (locale === "sv") return sv(pilotMode);
  if (locale === "fr") return fr(pilotMode);
  return en(pilotMode);
}
