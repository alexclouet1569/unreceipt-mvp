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
  /** Mission today and where UnReceipt is heading; clearly not a list of current features. */
  visionTitle: string;
  vision: string;
  contactTitle: string;
  contact: string;
};

export const ABOUT_AS_OF = "2026-11-16";

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
        "UnReceipt in plain facts: the receipt app small businesses share with their accountant, built for Sweden and France — how it works, what it costs, where data is stored and what it doesn't do.",
    },
    breadcrumb: "About UnReceipt",
    eyebrow: "Fact sheet",
    title: "What is UnReceipt?",
    summary:
      "UnReceipt is the receipt app a small business shares with its accountant. It is built for small businesses, freelancers and sole traders, and the accounting firms that keep their books, in Sweden and France. Receipts arrive as photos, as forwarded emails or straight from a connected Gmail or Outlook inbox; each one is read automatically in seconds into a record with its VAT amount and rate (where the receipt shows them), category and file, and the accountant sees it right away. It collects and checks receipts — it is not a bookkeeping program.",
    asOfLabel: "Facts as of",
    factsTitle: "Key facts",
    facts: [
      { label: "What it is", value: "A receipt collection and reading service, used in the browser on a phone or computer, or in the iPhone app (public beta on TestFlight)." },
      { label: "Who it's for", value: "Small businesses, freelancers and sole traders, and accounting firms collecting receipts from their clients." },
      { label: "Where", value: "Built for Sweden and France. Companies in other countries can sign up (home currency EUR, USD or GBP), but the VAT checks, guides and bookkeeping export are made for Sweden and France. The website and the iPhone app are in English, Swedish and French; the web app and emails are in English." },
      {
        label: "How receipts arrive",
        value: "Forwarded to the account's private UnReceipt email address (a Gmail or Outlook filter, set up once in a web browser, can forward them automatically), read from a connected Gmail or Outlook mailbox (only emails that look like a receipt, invoice or order confirmation are opened and saved), or photographed in the iPhone app or the browser — the fields fill themselves — including up to 50 photos or PDFs at once.",
      },
      {
        label: "What is recorded",
        value: "Merchant, date, total, currency and category; line items, VAT amount and VAT rate when the receipt shows them; the photo as uploaded (large photos are reduced in size on the device first) or the forwarded email, kept unchanged; and a PDF once the receipt is complete.",
      },
      { label: "Checking", value: "Each receipt is read automatically. Receipts that can't be read with confidence, and emails from senders that aren't trusted, wait in Review needed until you or your accountant confirm them. Receipts from a connected mailbox always wait there, and the accountant sees them only once you have confirmed them." },
      {
        label: "Foreign currencies",
        value: "A receipt in EUR, USD, GBP, NOK, DKK, CHF, PLN or SEK keeps its own amount and gets an estimated home-currency amount from the ECB reference rate of the purchase day (or the last banking day before it). The amount from the bank statement can be entered and takes precedence.",
      },
      {
        label: "For accounting firms",
        value: "A firm portal (on the web, and as a Clients tab in the iPhone app) listing every linked client with what's new, what needs review and what's ready. The firm imports a client's bank statement (CSV) to see payments without a receipt, sends a Monday reminder in its own name (or one at once), and exports a ZIP per client and period: a Swedish bookkeeping CSV (BAS account suggestions, SEK, one line per receipt and VAT rate), a receipts CSV, PDFs and the receipt files. Clients invite their accountant, or the firm invites clients by email (up to 25 at once) or with its own link and QR code.",
      },
      {
        label: "Teams",
        value: "A company owner can invite employees. Each sends their receipts for approval, saying whether they or the company paid; an owner or the employee's approver approves, sends back or rejects; approved receipts an employee paid are listed for paying back. The accountant sees an employee's receipt once it's approved.",
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
      "Small companies in Sweden or France — one person or a small team — whose receipts arrive by email and on paper, and who want them in one place, shared with their accountant.",
      "Freelancers and sole traders who want every receipt sorted with its VAT before the tax return.",
      "Accounting firms that collect receipts from many small clients and want them checked and exported per client and month.",
    ],
    notFitTitle: "Not the right tool if",
    notFit: [
      "you need receipts booked automatically into your bookkeeping program today: there are no direct integrations yet;",
      "you need a bookkeeping program itself: UnReceipt hands receipts to the one you or your accountant already use;",
      "you need VAT checks or a bookkeeping export made for a country other than Sweden or France.",
    ],
    limitsTitle: "What UnReceipt doesn't do (yet)",
    limits: [
      "No direct integration with bookkeeping programs such as Fortnox, Visma or Pennylane; the export is CSV, PDFs and receipt files.",
      "Team approvals are simple: one approver per person, no amount thresholds, no out-of-office delegate, and no payout or payroll file for paying employees back.",
      "Foreign-currency conversion covers EUR, USD, GBP, NOK, DKK, CHF, PLN and SEK.",
      "No bank or card connection, and no company cards.",
      "It doesn't decide whether VAT is deductible: the VAT is recorded as read from the receipt (worth checking), the bookkeeping CSV only suggests accounts, and the accountant decides.",
      "In France it doesn't produce the compliant copy (LPF art. A102 B-2) needed to destroy a paper invoice, so French users keep their paper originals.",
      "The web app and emails are in English only (the iPhone app is in English, Swedish and French), and there is no Android app yet.",
    ],
    visionTitle: "Why UnReceipt exists",
    vision:
      "Our mission: no business owner, and no accountant, should ever have to chase a receipt. We're starting with receipts and expenses. Where we're going: every expense, and in time every invoice and business document, handled automatically from the moment it arrives. Today UnReceipt does what this page lists, and nothing more.",
    contactTitle: "Contact",
    contact: "Questions, partnerships or a demo for your accounting firm: support@unreceipt.com.",
  };
}

function sv(pilot: boolean): About {
  return {
    meta: {
      title: "Vad är UnReceipt? Fakta, priser och begränsningar | UnReceipt",
      description:
        "UnReceipt i klartext: kvittoappen som småföretag delar med sin redovisningsbyrå, byggd för Sverige och Frankrike — hur den fungerar, vad den kostar, var data lagras och vad den inte gör.",
    },
    breadcrumb: "Om UnReceipt",
    eyebrow: "Faktablad",
    title: "Vad är UnReceipt?",
    summary:
      "UnReceipt är kvittoappen som ett småföretag delar med sin redovisningskonsult. Den är byggd för småföretag, enskilda firmor och frilansare, och för redovisningsbyråerna som sköter deras bokföring, i Sverige och Frankrike. Kvittona kommer in som foton, som vidarebefordrade mejl eller direkt från en kopplad Gmail- eller Outlook-inkorg; varje kvitto läses av automatiskt på några sekunder till ett underlag med momsbelopp och momssats (när kvittot visar dem), kategori och fil, och redovisningskonsulten ser det direkt. Tjänsten samlar in och kontrollerar kvitton — den är inget bokföringsprogram.",
    asOfLabel: "Uppgifterna gäller per",
    factsTitle: "Fakta i korthet",
    facts: [
      { label: "Vad det är", value: "En tjänst som samlar in och läser av kvitton, i webbläsaren på mobil eller dator, eller i iPhone-appen (öppen beta via TestFlight)." },
      { label: "För vem", value: "Småföretag, enskilda firmor och frilansare, och redovisningsbyråer som samlar in kvitton från sina klienter." },
      { label: "Var", value: "Byggd för Sverige och Frankrike. Företag i andra länder kan registrera sig (hemvaluta EUR, USD eller GBP), men momskontrollerna, guiderna och bokföringsexporten är gjorda för Sverige och Frankrike. Webbplatsen och iPhone-appen finns på svenska, engelska och franska; webbappen och mejlen är på engelska." },
      {
        label: "Så kommer kvittona in",
        value: "Vidarebefordrade till kontots privata UnReceipt-adress (ett filter i Gmail eller Outlook, som ställs in en gång i webbläsaren, kan göra det automatiskt), hämtade från en ansluten Gmail- eller Outlook-inkorg (bara mejl som ser ut som ett kvitto, en faktura eller en orderbekräftelse öppnas och sparas), eller fotade i iPhone-appen eller webbläsaren — fälten fylls i automatiskt — även upp till 50 foton eller PDF:er åt gången.",
      },
      {
        label: "Vad som sparas",
        value: "Säljare, datum, belopp, valuta och kategori; kvittorader, momsbelopp och momssats när kvittot visar dem; fotot som det laddades upp (stora foton förminskas i mobilen först) eller det vidarebefordrade mejlet, sparat oförändrat; och en PDF när kvittot är komplett.",
      },
      { label: "Kontroll", value: "Varje kvitto läses av automatiskt. Kvitton som inte kan läsas säkert, och mejl från avsändare som inte är betrodda, väntar i Review needed tills du eller din redovisningskonsult bekräftar dem. Kvitton från en ansluten inkorg väntar alltid där, och redovisningskonsulten ser dem först när du har bekräftat dem." },
      {
        label: "Utländsk valuta",
        value: "Ett kvitto i EUR, USD, GBP, NOK, DKK, CHF, PLN behåller sitt belopp och får ett uppskattat belopp i kronor från ECB:s referenskurs för köpdagen (eller närmast föregående bankdag). Beloppet från kontoutdraget kan skrivas in och gäller då före.",
      },
      {
        label: "För redovisningsbyråer",
        value: "En byråportal (på webben, och som fliken Clients i iPhone-appen) med alla kopplade klienter och vad som är nytt, behöver granskas eller är klart. Byrån importerar klientens kontoutdrag (CSV) för att se betalningar utan kvitto, skickar en påminnelse varje måndag i byråns namn (eller en direkt) och exporterar en ZIP per klient och period: en bokföringsfil (CSV med förslag på BAS-konto, i kronor, en rad per kvitto och momssats), en kvittolista, PDF:er och kvittofilerna. Klienten bjuder in byrån, eller byrån bjuder in klienter via mejl (upp till 25 åt gången) eller med sin egen länk och QR-kod.",
      },
      {
        label: "Team",
        value: "Företagets ägare kan bjuda in anställda. Var och en skickar sina kvitton för godkännande och anger om de själva eller företaget betalade; en ägare eller den anställdes attestant godkänner, skickar tillbaka eller avslår; godkända kvitton som den anställde betalat listas för återbetalning. Redovisningskonsulten ser en anställds kvitto först när det är godkänt.",
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
      "Småföretag i Sverige — en person eller ett litet team — vars kvitton kommer både som mejl och på papper, och som vill ha dem på ett ställe, delade med redovisningskonsulten.",
      "Enskilda firmor och frilansare som vill ha varje kvitto sorterat med momsen före deklarationen.",
      "Redovisningsbyråer som samlar in kvitton från många små klienter och vill ha dem kontrollerade och exporterade per klient och månad.",
    ],
    notFitTitle: "Inte rätt verktyg om",
    notFit: [
      "du behöver att kvittona bokförs automatiskt i ditt bokföringsprogram i dag: det finns inga direktintegrationer än;",
      "du behöver själva bokföringsprogrammet: UnReceipt lämnar kvittona till det program du eller din byrå redan använder;",
      "du behöver momskontroller eller en bokföringsexport för ett annat land än Sverige eller Frankrike.",
    ],
    limitsTitle: "Det här gör UnReceipt inte (än)",
    limits: [
      "Ingen direktintegration med bokföringsprogram som Fortnox eller Visma; exporten är CSV, PDF:er och kvittofiler.",
      "Attesten är enkel: en attestant per person, inga beloppsgränser, ingen ersättare vid frånvaro och ingen utbetalnings- eller lönefil för att betala tillbaka till anställda.",
      "Valutaomräkningen omfattar EUR, USD, GBP, NOK, DKK, CHF och PLN.",
      "Ingen bank- eller kortkoppling, och inga företagskort.",
      "Tjänsten avgör inte om momsen är avdragsgill: momsen sparas som den lästs av från kvittot (värt att kontrollera), bokföringsfilen föreslår bara konton, och redovisningskonsulten avgör.",
      "Webbappen och mejlen finns bara på engelska (iPhone-appen finns på svenska, engelska och franska), och det finns ingen Android-app än.",
    ],
    visionTitle: "Varför UnReceipt finns",
    vision:
      "Vårt uppdrag: ingen företagare, och ingen redovisningskonsult, ska behöva jaga ett kvitto igen. Vi börjar med kvitton och utlägg. Dit vi är på väg: varje utgift, och med tiden varje faktura och affärsdokument, hanterat automatiskt från det ögonblick det kommer in. I dag gör UnReceipt det som står på den här sidan, och inget mer.",
    contactTitle: "Kontakt",
    contact: "Frågor, samarbeten eller en demo för din redovisningsbyrå: support@unreceipt.com.",
  };
}

function fr(pilot: boolean): About {
  return {
    meta: {
      title: "Qu’est-ce qu’UnReceipt ? Faits, tarifs et limites | UnReceipt",
      description:
        "UnReceipt en faits : l’application de reçus que les TPE partagent avec leur expert-comptable, conçue pour la France et la Suède — fonctionnement, tarifs, hébergement des données et limites.",
    },
    breadcrumb: "À propos d’UnReceipt",
    eyebrow: "Fiche d’information",
    title: "Qu’est-ce qu’UnReceipt ?",
    summary:
      "UnReceipt est l’application de reçus qu’une petite entreprise partage avec son expert-comptable. Elle est conçue pour les TPE, les indépendants et micro-entrepreneurs, et les cabinets d’expertise comptable qui tiennent leur comptabilité, en France et en Suède. Les reçus arrivent en photo, par e-mail transféré ou directement depuis une boîte Gmail ou Outlook connectée ; chacun est lu automatiquement en quelques secondes et devient une fiche avec le montant et le taux de TVA (quand le justificatif les indique), la catégorie et le fichier, que l’expert-comptable voit aussitôt. Le service collecte et vérifie les justificatifs — ce n’est pas un logiciel de comptabilité.",
    asOfLabel: "Informations à jour au",
    factsTitle: "L’essentiel",
    facts: [
      { label: "Ce que c’est", value: "Un service de collecte et de lecture des reçus, dans le navigateur, sur téléphone ou ordinateur, ou dans l’app iPhone (bêta publique via TestFlight)." },
      { label: "Pour qui", value: "TPE, indépendants et micro-entrepreneurs, et cabinets d’expertise comptable qui collectent les justificatifs de leurs clients." },
      { label: "Où", value: "Conçu pour la France et la Suède. Les entreprises d’autres pays peuvent s’inscrire (devise EUR, USD ou GBP), mais les contrôles de TVA, les guides et l’export comptable sont pensés pour la France et la Suède. Le site et l’app iPhone sont en français, en anglais et en suédois ; l’application web et les e-mails sont en anglais." },
      {
        label: "Comment arrivent les reçus",
        value: "Transférés à l’adresse e-mail UnReceipt privée du compte (un filtre Gmail ou Outlook, réglé une fois dans le navigateur, peut le faire automatiquement), lus dans une boîte Gmail ou Outlook connectée (seuls les e-mails qui ressemblent à un reçu, une facture ou une confirmation de commande sont ouverts et enregistrés), ou photographiés dans l’app iPhone ou le navigateur — les champs se remplissent tout seuls — y compris jusqu’à 50 photos ou PDF d’un coup.",
      },
      {
        label: "Ce qui est enregistré",
        value: "Fournisseur, date, montant, devise et catégorie ; lignes, montant et taux de TVA quand le justificatif les indique ; la photo telle qu’envoyée (les photos volumineuses sont réduites sur l’appareil) ou l’e-mail transféré, conservé à l’identique ; et un PDF une fois le reçu complet.",
      },
      { label: "Vérification", value: "Chaque reçu est lu automatiquement. Les reçus qui ne peuvent pas être lus avec certitude, et les e-mails d’expéditeurs non reconnus, attendent dans « Review needed » que vous ou votre expert-comptable les confirmiez. Les reçus d’une boîte mail connectée y attendent toujours, et l’expert-comptable ne les voit qu’une fois que vous les avez confirmés." },
      {
        label: "Devises",
        value: "Un reçu en SEK, USD, GBP, NOK, DKK, CHF ou PLN garde son montant et reçoit un montant estimé en euros au taux de référence de la BCE du jour de l’achat (ou du dernier jour ouvré). Le montant du relevé bancaire peut être saisi et prévaut.",
      },
      {
        label: "Pour les cabinets",
        value: "Un portail cabinet (sur le web, et dans l’onglet Clients de l’app iPhone) avec tous les clients reliés et ce qui est nouveau, à revoir ou prêt. Le cabinet importe le relevé bancaire d’un client (CSV) pour voir les paiements sans reçu, envoie un rappel chaque lundi à son nom (ou un rappel immédiat), et exporte un ZIP par client et par mois : un CSV des reçus, les PDF et les fichiers d’origine. Le client invite son expert-comptable, ou le cabinet invite ses clients par e-mail (jusqu’à 25 d’un coup) ou avec son propre lien et QR code.",
      },
      {
        label: "Équipe",
        value: "Le dirigeant peut inviter ses salariés. Chacun envoie ses reçus pour validation en indiquant s’il a payé lui-même ou si l’entreprise a payé ; le dirigeant ou le valideur du salarié valide, renvoie ou refuse ; les reçus validés payés par un salarié sont listés pour remboursement. L’expert-comptable ne voit le reçu d’un salarié qu’une fois validé.",
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
      "Les TPE en France — une personne ou une petite équipe — dont les reçus arrivent par e-mail et sur papier, et qui veulent les centraliser avec leur expert-comptable.",
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
      "La validation reste simple : un valideur par personne, pas de seuils de montant, pas de suppléant en cas d’absence, et pas de fichier de virement ou de paie pour rembourser les salariés.",
      "La conversion couvre SEK, USD, GBP, NOK, DKK, CHF et PLN.",
      "Pas de connexion bancaire ni de carte, et pas de cartes d’entreprise.",
      "Le service ne décide pas si la TVA est récupérable : elle est relevée telle que lue sur le justificatif (à vérifier), et l’expert-comptable décide.",
      "Pas de copie conforme au sens de l’article A102 B-2 du LPF : conservez vos originaux papier.",
      "L’application web et les e-mails sont en anglais uniquement (l’app iPhone est en français, en anglais et en suédois), et il n’y a pas encore d’app Android.",
    ],
    visionTitle: "Pourquoi UnReceipt existe",
    vision:
      "Notre mission : qu’aucun dirigeant, ni aucun expert-comptable, n’ait plus jamais à courir après un reçu. Nous commençons par les reçus et les notes de frais. Là où nous allons : chaque dépense, et à terme chaque facture et document de l’entreprise, traités automatiquement dès leur arrivée. Aujourd’hui, UnReceipt fait ce que décrit cette page, rien de plus.",
    contactTitle: "Contact",
    contact: "Questions, partenariats ou démo pour votre cabinet : support@unreceipt.com.",
  };
}

export function getAbout(locale: Locale, pilotMode: boolean): About {
  if (locale === "sv") return sv(pilotMode);
  if (locale === "fr") return fr(pilotMode);
  return en(pilotMode);
}
