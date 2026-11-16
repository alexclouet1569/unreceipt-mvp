import type { FaqItem } from "@/lib/faq";
import type { Locale } from "@/lib/locale";
import type { MarketingPageId } from "@/lib/marketing-pages";

/**
 * Words for the audience pages: accounting firms (/accountants,
 * /sv/redovisningsbyra, /fr/experts-comptables) and freelancers / sole
 * traders (/freelancers, /sv/enskild-firma, /fr/independants).
 *
 * Every claim must be true of the product today (see AGENTS.md "Firm portal
 * auth", "Currency", "Exports"). No testimonials, logos or numbers we can't
 * back. Prices come from plans.ts; `{price}` is filled with the cheapest
 * plan in the page's currency, and only while SHOW_PRICES is on.
 *
 * The FAQ answers here are also the page's FAQPage structured data and go
 * into /llms.txt, so they must read well on their own.
 */

export type AudienceId = "accountants" | "freelancers";

/** Where a button goes; resolved to a URL in _audience-page.tsx. */
export type Cta = "signup" | "demoCompany" | "demoAccountant" | "contactFirm";

export type IconName =
  | "mail"
  | "camera"
  | "receipt"
  | "users"
  | "layers"
  | "check"
  | "download"
  | "globe"
  | "calculator"
  | "shield"
  | "book"
  | "clock";

type Item = { title: string; desc: string };
type Three<T> = [T, T, T];
type Four<T> = [T, T, T, T];
type Six<T> = [T, T, T, T, T, T];

export type AudienceCopy = {
  meta: { title: string; description: string; shareTitle: string; keywords: string[] };
  breadcrumb: string;
  audienceType: string;
  hero: {
    eyebrow: string;
    title: string;
    accent: string;
    lead: string;
    primary: Cta;
    /** Label for a non-signup primary button. Signup buttons follow PILOT_MODE. */
    primaryLabel?: string;
    secondary: Cta;
    secondaryLabel: string;
    notePilot: string;
    notePaid: string;
    /** Used instead while prices are hidden (src/lib/pricing-visibility.ts). */
    notePilotNoPrice?: string;
    notePaidNoPrice?: string;
  };
  panel: { title: string; caption: string; rows: Four<{ label: string; value: string; done: boolean }> };
  compare: { eyebrow: string; title: string; oldTitle: string; old: Four<string>; newTitle: string; new: Four<string> };
  steps: { eyebrow: string; title: string; step: string; items: Three<Item> };
  features: { eyebrow: string; title: string; items: Six<Item & { icon: IconName }> };
  related: { title: string; links: { label: string; page: MarketingPageId }[] };
  faqTitle: string;
  faq: FaqItem[];
  ending: {
    title: string;
    lead: string;
    primary: Cta;
    primaryLabel?: string;
    secondary: Cta;
    secondaryLabel: string;
  };
  contactSubject: string;
};

// ─── Accounting firms ────────────────────────────────────────────────

const accountantsEn: AudienceCopy = {
  meta: {
    title: "Receipt Collection Software for Accounting Firms | UnReceipt",
    description:
      "Get your clients' receipts read, checked and VAT-split in one portal. See what needs review per client, export a month for your bookkeeping, never book a receipt twice.",
    shareTitle: "UnReceipt for accounting firms — your clients' receipts, ready to book",
    keywords: [
      "receipt software for accountants",
      "accounting firm client receipts",
      "collect receipts from clients",
      "bookkeeping receipt portal",
      "receipt management for bookkeepers",
      "accountant receipt app",
    ],
  },
  breadcrumb: "For accounting firms",
  audienceType: "Accounting firms and bookkeepers",
  hero: {
    eyebrow: "For accounting firms",
    title: "Your clients' receipts,",
    accent: "ready to book.",
    lead: "Stop chasing photos, forwarded PDFs and paper bags at month-end. Your clients snap or forward their receipts to UnReceipt; you get every one read, checked and VAT-split in one portal, with one export per client and month.",
    primary: "contactFirm",
    primaryLabel: "Book a 20-minute demo",
    secondary: "demoAccountant",
    secondaryLabel: "Try the accountant demo",
    notePilot: "No installation. Clients invite you, or you invite them.",
    notePaid: "No installation. Clients invite you, or you invite them.",
  },
  panel: {
    title: "Your clients",
    caption: "Illustration with sample companies",
    rows: [
      { label: "Hansson Bygg AB", value: "3 to review", done: false },
      { label: "Lindqvist Design", value: "All checked", done: true },
      { label: "Café Norrgatan", value: "1 to review", done: false },
      { label: "Ek & Berg Konsult", value: "Exported", done: true },
    ],
  },
  compare: {
    eyebrow: "Month-end",
    title: "Close the month without the chase",
    oldTitle: "Without UnReceipt",
    old: [
      "Receipts arrive late, as photos, PDFs and paper",
      "Merchant, amount and VAT typed in by hand",
      "Emails to clients about the receipts that are missing",
      "A rate looked up for every foreign-currency receipt",
    ],
    newTitle: "With UnReceipt",
    new: [
      "Clients send each receipt when they pay: photo, forwarded email or connected inbox",
      "Merchant, date, VAT amount and rate already read for you",
      "Bank payments without a receipt listed, and a Monday reminder sent for you",
      "Foreign receipts converted at the ECB rate of the purchase day",
    ],
  },
  steps: {
    eyebrow: "How it works",
    title: "Three steps for your firm",
    step: "STEP",
    items: [
      {
        title: "Link your clients",
        desc: "Invite clients by email, up to 25 at once, or share your firm's own link and QR code; a client can also invite you. Nothing is shared until the client says yes from its own signed-in account.",
      },
      {
        title: "They send, we read",
        desc: "Clients snap paper receipts, forward email ones or connect their Gmail or Outlook. Each receipt is read in seconds and reaches your portal as it arrives.",
      },
      {
        title: "You review and export",
        desc: "Open a client's month, import the bank statement to see what's missing, complete the rest, then export a ZIP: a bookkeeping file with one line per receipt and VAT rate, plus every PDF and original.",
      },
    ],
  },
  features: {
    eyebrow: "Built for bookkeeping",
    title: "What your firm gets",
    items: [
      {
        icon: "users",
        title: "Every client on one screen",
        desc: "All linked companies with what's new, what needs a check and what's ready, on the web and in the Clients tab of the iPhone app.",
      },
      {
        icon: "receipt",
        title: "Payments without a receipt",
        desc: "Import a client's bank statement (a CSV file, no bank login) and see which payments still have no receipt. Email the list to the client in one click.",
      },
      {
        icon: "calculator",
        title: "Account suggestions you control",
        desc: "A suggested BAS account per receipt from its category (standard BAS defaults), with input VAT on 2640 where it's deductible Swedish VAT. Change it on any receipt and your choice wins.",
      },
      {
        icon: "check",
        title: "Never book a receipt twice",
        desc: "An export only takes receipts that haven't been exported before, and you can mark each one as booked with its voucher number.",
      },
      {
        icon: "clock",
        title: "A reminder every Monday",
        desc: "Clients get one email in your firm's name listing what's still missing; nothing is sent when all is in. Switch it per client, or send one now.",
      },
      {
        icon: "layers",
        title: "Your whole team",
        desc: "Add colleagues to your firm's portal; each signs in with their own work email. Every edit shows who made it.",
      },
    ],
  },
  related: {
    title: "Useful for your clients",
    links: [
      { label: "UnReceipt for freelancers and sole traders", page: "freelancers" },
      { label: "How long do companies have to keep receipts?", page: "guideRetention" },
    ],
  },
  faqTitle: "Questions from accounting firms",
  faq: [
    {
      q: "How does an accounting firm get started with UnReceipt?",
      a: "Write to support@unreceipt.com and we'll set up your firm's portal and walk you through it, or ask a client to invite you from UnReceipt (Settings → Your accountant) and accept: that creates your portal too. From the portal you invite your other clients by email (up to 25 at once) or share your firm's link and QR code.",
    },
    {
      q: "What does UnReceipt cost an accounting firm?",
      a: "Your firm doesn't need a plan of its own. Each client company has its own UnReceipt plan, and receipts you complete for a client count on that client's plan. If you'd rather cover your clients under one firm agreement, talk to us.",
    },
    {
      q: "What is in the export?",
      a: "One ZIP per client and period: a bookkeeping CSV with one line per receipt and VAT rate (date, merchant, seller's org. and VAT number, currency, net, VAT, a suggested BAS account from standard BAS defaults, and input-VAT account 2640 where the VAT is deductible Swedish input VAT), a receipts CSV, a PDF of every checked receipt and the original files. It's a semicolon-separated CSV with decimal commas. There are no direct integrations with bookkeeping programs yet.",
    },
    {
      q: "Who can see a client's receipts?",
      a: "Besides the client itself, only your firm's staff, and only for companies linked to your firm. A link exists only once the invited side has accepted it, signed in with the address the invite was sent to, and the client gets an email confirming every new link. Receipts are stored in the EU, in Frankfurt.",
    },
    {
      q: "Can I change the category or account of a receipt?",
      a: "Yes. You can complete and correct any receipt of a linked client, set the account it's booked on and mark it as booked. The account suggestions are only suggestions: whether a purchase is deductible remains your judgement.",
    },
    {
      q: "Is the portal in Swedish?",
      a: "The iPhone app is in English, Swedish and French. The web portal and the emails are in English for now.",
    },
  ],
  ending: {
    title: "See it with your own clients' receipts",
    lead: "20 minutes on a call, or two minutes in the demo with sample data.",
    primary: "contactFirm",
    primaryLabel: "Book a demo",
    secondary: "demoAccountant",
    secondaryLabel: "Try the accountant demo",
  },
  contactSubject: "UnReceipt for our accounting firm",
};

const accountantsSv: AudienceCopy = {
  meta: {
    title: "Kvittohantering för redovisningsbyråer – klienternas kvitton | UnReceipt",
    description:
      "Få klienternas kvitton avlästa, kontrollerade och med momsen uppdelad i en byråportal. Se vad som behöver granskas per klient, exportera månaden med BAS-kontoförslag och bokför aldrig ett kvitto två gånger.",
    shareTitle: "UnReceipt för redovisningsbyråer — klienternas kvitton, klara att bokföra",
    keywords: [
      "kvittohantering redovisningsbyrå",
      "redovisningsbyrå kvitton klienter",
      "samla in kvitton från kunder",
      "kvitton bokföringsbyrå",
      "verifikationer klienter",
      "redovisningskonsult kvittoapp",
      "BAS-konto kvitton",
    ],
  },
  breadcrumb: "För redovisningsbyråer",
  audienceType: "Redovisningsbyråer och redovisningskonsulter",
  hero: {
    eyebrow: "För redovisningsbyråer",
    title: "Klienternas kvitton,",
    accent: "klara att bokföra.",
    lead: "Sluta jaga foton, vidarebefordrade PDF:er och kvittopåsar vid månadsskiftet. Dina klienter fotar eller vidarebefordrar sina kvitton till UnReceipt, och du får varje kvitto avläst, kontrollerat och med momsen uppdelad i en portal, med en export per klient och månad.",
    primary: "contactFirm",
    primaryLabel: "Boka en demo på 20 minuter",
    secondary: "demoAccountant",
    secondaryLabel: "Testa byrådemon",
    notePilot: "Ingen installation. Klienten bjuder in er, eller ni bjuder in klienten.",
    notePaid: "Ingen installation. Klienten bjuder in er, eller ni bjuder in klienten.",
  },
  panel: {
    title: "Dina klienter",
    caption: "Illustration med påhittade företag",
    rows: [
      { label: "Hansson Bygg AB", value: "3 att granska", done: false },
      { label: "Lindqvist Design", value: "Allt kontrollerat", done: true },
      { label: "Café Norrgatan", value: "1 att granska", done: false },
      { label: "Ek & Berg Konsult", value: "Exporterat", done: true },
    ],
  },
  compare: {
    eyebrow: "Månadsskiftet",
    title: "Stäng månaden utan kvittojakt",
    oldTitle: "Utan UnReceipt",
    old: [
      "Kvitton kommer sent, som foton, PDF:er och papper",
      "Säljare, belopp och moms knappas in för hand",
      "Mejl till klienter om kvitton som saknas",
      "Valutakurs letas fram för varje utländskt kvitto",
    ],
    newTitle: "Med UnReceipt",
    new: [
      "Klienten skickar kvittot direkt vid köpet: foto, vidarebefordrat mejl eller kopplad inkorg",
      "Säljare, datum, momsbelopp och momssats redan avlästa åt dig",
      "Betalningar utan kvitto listade, och en påminnelse varje måndag skickas åt dig",
      "Utländska kvitton omräknade med ECB:s kurs för köpdagen",
    ],
  },
  steps: {
    eyebrow: "Så funkar det",
    title: "Tre steg för byrån",
    step: "STEG",
    items: [
      {
        title: "Koppla dina klienter",
        desc: "Bjud in klienter via mejl, upp till 25 åt gången, eller dela byråns egen länk och QR-kod; en klient kan också bjuda in dig. Inget delas förrän klienten tackar ja från sitt eget inloggade konto.",
      },
      {
        title: "De skickar, vi läser av",
        desc: "Klienterna fotar papperskvitton, vidarebefordrar e-postkvitton eller kopplar sin Gmail eller Outlook. Varje kvitto läses av på sekunder och kommer till portalen direkt.",
      },
      {
        title: "Du granskar och exporterar",
        desc: "Öppna klientens månad, importera kontoutdraget för att se vad som saknas, komplettera resten och exportera en ZIP: en bokföringsfil med en rad per kvitto och momssats, plus varje PDF och original.",
      },
    ],
  },
  features: {
    eyebrow: "Byggt för bokföringen",
    title: "Det här får byrån",
    items: [
      {
        icon: "users",
        title: "Alla klienter i en vy",
        desc: "Alla kopplade företag med vad som är nytt, vad som behöver granskas och vad som är klart, på webben och under Clients i iPhone-appen.",
      },
      {
        icon: "receipt",
        title: "Betalningar utan kvitto",
        desc: "Importera klientens kontoutdrag (en CSV-fil, ingen bankinloggning) och se vilka betalningar som fortfarande saknar kvitto. Mejla listan till klienten med ett klick.",
      },
      {
        icon: "calculator",
        title: "BAS-kontoförslag som du styr",
        desc: "Ett förslag på BAS-konto per kvitto utifrån kategorin (standardkonton i BAS), och ingående moms på 2640 där svensk moms är avdragsgill. Ändra kontot på vilket kvitto som helst så gäller ditt val.",
      },
      {
        icon: "check",
        title: "Inget kvitto bokförs två gånger",
        desc: "En export tar bara med kvitton som inte exporterats tidigare, och du kan markera varje kvitto som bokfört med verifikationsnummer.",
      },
      {
        icon: "clock",
        title: "En påminnelse varje måndag",
        desc: "Klienten får ett mejl i byråns namn med det som fortfarande saknas; inget skickas när allt är på plats. Slå av eller på per klient, eller skicka en direkt.",
      },
      {
        icon: "layers",
        title: "Hela byrån",
        desc: "Lägg till kollegor i byråns portal; var och en loggar in med sin egen jobbmejl. Varje ändring visar vem som gjorde den.",
      },
    ],
  },
  related: {
    title: "Bra att skicka till klienterna",
    links: [
      { label: "UnReceipt för enskild firma", page: "freelancers" },
      { label: "Hur länge ska man spara kvitton?", page: "guideRetention" },
      { label: "Får man slänga papperskvitton?", page: "guidePaper" },
    ],
  },
  faqTitle: "Frågor från redovisningsbyråer",
  faq: [
    {
      q: "Hur kommer en redovisningsbyrå igång med UnReceipt?",
      a: "Mejla support@unreceipt.com så sätter vi upp byråns portal och visar hur det fungerar, eller be en klient bjuda in dig från UnReceipt (Settings → Your accountant) och acceptera: då skapas portalen också. Från portalen bjuder du in dina andra klienter via mejl (upp till 25 åt gången) eller delar byråns länk och QR-kod.",
    },
    {
      q: "Vad kostar UnReceipt för en redovisningsbyrå?",
      a: "Byrån behöver ingen egen plan. Varje klientföretag har sin egen UnReceipt-plan, och kvitton som du färdigställer åt en klient räknas på klientens plan. Vill ni hellre täcka era klienter med ett avtal för hela byrån, hör av er.",
    },
    {
      q: "Vad innehåller exporten?",
      a: "En ZIP per klient och period: en bokföringsfil (CSV) med en rad per kvitto och momssats (datum, säljare, säljarens organisations- och momsregistreringsnummer, valuta, netto, moms, förslag på BAS-konto utifrån standardkonton och konto 2640 för ingående moms där svensk moms är avdragsgill), en kvittolista i CSV, en PDF för varje kontrollerat kvitto och originalfilerna. CSV-filen är semikolonseparerad med decimalkomma. Det finns inga direktintegrationer med bokföringsprogram än.",
    },
    {
      q: "Vem kan se klientens kvitton?",
      a: "Förutom klienten själv bara byråns personal, och bara för företag som är kopplade till byrån. En koppling finns först när den inbjudna parten har accepterat, inloggad med adressen som inbjudan skickades till, och klienten får ett mejl som bekräftar varje ny koppling. Kvittona lagras inom EU, i Frankfurt.",
    },
    {
      q: "Kan jag ändra kategori eller konto på ett kvitto?",
      a: "Ja. Du kan komplettera och rätta varje kvitto hos en kopplad klient, välja vilket konto det bokförs på och markera det som bokfört. Kontoförslagen är bara förslag: om ett köp är avdragsgillt avgör du.",
    },
    {
      q: "Finns portalen på svenska?",
      a: "iPhone-appen finns på svenska, engelska och franska. Webbportalen och mejlen är på engelska än så länge.",
    },
  ],
  ending: {
    title: "Se det med dina egna klienters kvitton",
    lead: "20 minuter i ett samtal, eller två minuter i demon med exempeldata.",
    primary: "contactFirm",
    primaryLabel: "Boka en demo",
    secondary: "demoAccountant",
    secondaryLabel: "Testa byrådemon",
  },
  contactSubject: "UnReceipt för vår redovisningsbyrå",
};

const accountantsFr: AudienceCopy = {
  meta: {
    title: "Collecte des justificatifs pour experts-comptables | UnReceipt",
    description:
      "Recevez les reçus de vos clients lus, vérifiés et avec la TVA relevée dans un portail cabinet. Voyez ce qui reste à revoir par client et exportez chaque mois CSV et justificatifs PDF.",
    shareTitle: "UnReceipt pour les experts-comptables — les justificatifs de vos clients, prêts à saisir",
    keywords: [
      "collecte justificatifs expert-comptable",
      "logiciel justificatifs clients cabinet comptable",
      "récupérer les justificatifs des clients",
      "gestion des notes de frais cabinet",
      "dématérialisation des reçus expert-comptable",
      "application reçus expert-comptable",
    ],
  },
  breadcrumb: "Experts-comptables",
  audienceType: "Cabinets d’expertise comptable",
  hero: {
    eyebrow: "Pour les experts-comptables",
    title: "Les justificatifs de vos clients,",
    accent: "prêts à saisir.",
    lead: "Fini les relances, les photos floues et les sacs de tickets en fin de mois. Vos clients photographient ou transfèrent leurs reçus à UnReceipt ; vous les retrouvez lus, vérifiés et avec la TVA relevée dans un seul portail, avec un export par client et par mois.",
    primary: "contactFirm",
    primaryLabel: "Réserver une démo de 20 minutes",
    secondary: "demoAccountant",
    secondaryLabel: "Essayer la démo cabinet",
    notePilot: "Aucune installation. Votre client vous invite, ou vous l’invitez.",
    notePaid: "Aucune installation. Votre client vous invite, ou vous l’invitez.",
  },
  panel: {
    title: "Vos clients",
    caption: "Illustration avec des entreprises fictives",
    rows: [
      { label: "Boulangerie Martin", value: "3 à revoir", done: false },
      { label: "Studio Lefèvre", value: "Tout vérifié", done: true },
      { label: "Atelier Garnier", value: "1 à revoir", done: false },
      { label: "Conseil Dubois SAS", value: "Exporté", done: true },
    ],
  },
  compare: {
    eyebrow: "La fin de mois",
    title: "Clôturez le mois sans courir après les reçus",
    oldTitle: "Sans UnReceipt",
    old: [
      "Des justificatifs en retard, en photo, en PDF ou sur papier",
      "Fournisseur, montant et TVA saisis à la main",
      "Des relances aux clients pour les pièces manquantes",
      "Un taux de change à chercher pour chaque reçu en devise",
    ],
    newTitle: "Avec UnReceipt",
    new: [
      "Le client envoie chaque reçu au moment de l’achat : photo, e-mail transféré ou boîte connectée",
      "Fournisseur, date, montant et taux de TVA déjà lus pour vous",
      "Les paiements sans reçu listés, et un rappel envoyé pour vous chaque lundi",
      "Reçus en devises convertis au taux BCE du jour de l’achat",
    ],
  },
  steps: {
    eyebrow: "Comment ça marche",
    title: "Trois étapes pour votre cabinet",
    step: "ÉTAPE",
    items: [
      {
        title: "Reliez vos clients",
        desc: "Invitez vos clients par e-mail, jusqu’à 25 d’un coup, ou partagez le lien et le QR code de votre cabinet ; un client peut aussi vous inviter. Rien n’est partagé avant que le client accepte depuis son propre compte connecté.",
      },
      {
        title: "Ils envoient, nous lisons",
        desc: "Vos clients photographient leurs tickets, transfèrent leurs reçus par e-mail ou connectent leur Gmail ou Outlook. Chaque reçu est lu en quelques secondes et arrive aussitôt dans votre portail.",
      },
      {
        title: "Vous revoyez et exportez",
        desc: "Ouvrez le mois d’un client, importez son relevé bancaire pour voir ce qui manque, complétez le reste, puis exportez un ZIP : un CSV des reçus avec montants et TVA, chaque justificatif en PDF et les fichiers d’origine.",
      },
    ],
  },
  features: {
    eyebrow: "Pensé pour la saisie",
    title: "Ce que votre cabinet y gagne",
    items: [
      {
        icon: "users",
        title: "Tous vos clients sur un écran",
        desc: "Toutes les entreprises reliées avec ce qui est nouveau, à vérifier ou prêt, sur le web et dans l’onglet Clients de l’app iPhone.",
      },
      {
        icon: "receipt",
        title: "Les paiements sans reçu",
        desc: "Importez le relevé bancaire d’un client (un fichier CSV, sans accès à sa banque) et voyez quels paiements n’ont pas encore de reçu. Envoyez la liste au client en un clic.",
      },
      {
        icon: "check",
        title: "Jamais saisi deux fois",
        desc: "Un export ne reprend que les reçus jamais exportés, et vous pouvez marquer chaque reçu comme comptabilisé avec sa référence.",
      },
      {
        icon: "clock",
        title: "Un rappel chaque lundi",
        desc: "Le client reçoit un e-mail au nom du cabinet avec ce qui manque encore ; rien n’est envoyé quand tout est là. Activez-le client par client, ou envoyez-en un tout de suite.",
      },
      {
        icon: "download",
        title: "L’original conservé",
        desc: "Chaque reçu garde la photo envoyée ou l’e-mail reçu, et un PDF une fois vérifié, dans l’export comme dans le portail.",
      },
      {
        icon: "layers",
        title: "Toute l’équipe",
        desc: "Ajoutez vos collaborateurs au portail du cabinet ; chacun se connecte avec son e-mail professionnel. Chaque modification indique qui l’a faite.",
      },
    ],
  },
  related: {
    title: "Utile pour vos clients",
    links: [
      { label: "UnReceipt pour les indépendants", page: "freelancers" },
      { label: "Combien de temps conserver les justificatifs ?", page: "guideRetention" },
      { label: "Peut-on jeter les tickets de caisse après numérisation ?", page: "guidePaper" },
    ],
  },
  faqTitle: "Les questions des experts-comptables",
  faq: [
    {
      q: "Comment un cabinet d’expertise comptable démarre-t-il avec UnReceipt ?",
      a: "Écrivez à support@unreceipt.com et nous configurons le portail de votre cabinet avec vous, ou demandez à un client de vous inviter depuis UnReceipt (Settings → Your accountant) et acceptez : le portail est créé aussi. Depuis le portail, vous invitez vos autres clients par e-mail (jusqu’à 25 d’un coup) ou partagez le lien et le QR code du cabinet.",
    },
    {
      q: "Combien coûte UnReceipt pour un cabinet ?",
      a: "Votre cabinet n’a pas besoin d’abonnement propre. Chaque entreprise cliente a sa formule UnReceipt, et les reçus que vous complétez pour un client comptent sur la formule de ce client. Si vous préférez couvrir vos clients par un accord au niveau du cabinet, parlons-en.",
    },
    {
      q: "Que contient l’export ?",
      a: "Un ZIP par client et par période : un CSV des reçus (date, fournisseur, montant, devise, montant et taux de TVA, catégorie, numéro de TVA du fournisseur), un PDF de chaque reçu et les fichiers d’origine. Le CSV est séparé par des points-virgules, avec la virgule décimale. Il n’y a pas encore d’intégration directe avec un logiciel comptable.",
    },
    {
      q: "Qui peut voir les reçus d’un client ?",
      a: "Outre le client lui-même, seuls les collaborateurs de votre cabinet, et seulement pour les entreprises reliées au cabinet. Un lien n’existe qu’une fois accepté par la partie invitée, connectée avec l’adresse à laquelle l’invitation a été envoyée, et le client reçoit un e-mail qui confirme chaque nouveau lien. Les reçus sont hébergés dans l’UE, à Francfort.",
    },
    {
      q: "UnReceipt remplace-t-il le ticket papier ?",
      a: "Non, pas en France aujourd’hui. UnReceipt ne produit pas la copie conforme qu’exige l’article A102 B-2 du Livre des procédures fiscales pour détruire une facture papier : vos clients conservent leurs originaux papier. UnReceipt sert à les collecter, les lire et vous les transmettre.",
    },
    {
      q: "Le portail est-il en français ?",
      a: "L’app iPhone est en français, en anglais et en suédois. Le portail web et les e-mails sont pour l’instant en anglais.",
    },
  ],
  ending: {
    title: "Voyez-le avec les reçus de vos propres clients",
    lead: "20 minutes en visio, ou deux minutes dans la démo avec des données d’exemple.",
    primary: "contactFirm",
    primaryLabel: "Réserver une démo",
    secondary: "demoAccountant",
    secondaryLabel: "Essayer la démo cabinet",
  },
  contactSubject: "UnReceipt pour notre cabinet",
};

// ─── Freelancers and sole traders ────────────────────────────────────

const freelancersEn: AudienceCopy = {
  meta: {
    title: "Receipt App for Freelancers & Sole Traders | UnReceipt",
    description:
      "Snap paper receipts, forward email ones and keep every expense VAT-ready for your accountant or tax return. Built for freelancers, consultants and one-person businesses.",
    shareTitle: "UnReceipt for freelancers — every receipt sorted before tax time",
    keywords: [
      "receipt app for freelancers",
      "receipt tracker sole trader",
      "expense receipts self-employed",
      "keep receipts for taxes freelancer",
      "receipt scanner small business",
      "VAT receipts freelancer",
    ],
  },
  breadcrumb: "For freelancers",
  audienceType: "Freelancers, consultants and sole traders",
  hero: {
    eyebrow: "For freelancers & sole traders",
    title: "Every receipt sorted,",
    accent: "before tax time.",
    lead: "You run the business and you do the books. UnReceipt takes the receipts off your plate: snap the paper ones, forward the email ones, and each expense is saved with its VAT, category and original — ready for your accountant or your own tax return.",
    primary: "signup",
    secondary: "demoCompany",
    secondaryLabel: "See the demo",
    notePilot: "Free during the pilot. Plans from {price}/month after.",
    notePaid: "Plans from {price}/month + VAT after the free week. Cancel anytime.",
    notePilotNoPrice: "Free during the pilot. No card needed.",
    notePaidNoPrice: "First week free. Cancel anytime.",
  },
  panel: {
    title: "This month",
    caption: "Illustration with sample receipts",
    rows: [
      { label: "SJ · Travel", value: "895,00 kr", done: true },
      { label: "Clas Ohlson · Office", value: "1 450,00 kr", done: true },
      { label: "Adobe · Software", value: "€23.99", done: true },
      { label: "Uber · Transport", value: "189,00 kr", done: false },
    ],
  },
  compare: {
    eyebrow: "The difference",
    title: "No more shoebox at year-end",
    oldTitle: "The old way",
    old: [
      "Receipts in your wallet, your car and three inboxes",
      "A pile to sort the week the tax return is due",
      "Subscriptions in dollars and euros to convert by hand",
      "Paying your accountant to type in receipts",
    ],
    newTitle: "With UnReceipt",
    new: [
      "A camera button, your own receipt address and your inbox connected once",
      "Every receipt sorted by date and category as it arrives",
      "Foreign receipts converted at the ECB rate of the purchase day",
      "Your accountant sees your receipts directly, or you export a ZIP",
    ],
  },
  steps: {
    eyebrow: "How it works",
    title: "Set up in five minutes",
    step: "STEP",
    items: [
      {
        title: "Snap or forward",
        desc: "Take a photo of a paper receipt — the fields fill themselves — or forward an email receipt to your private UnReceipt address.",
      },
      {
        title: "Make it automatic",
        desc: "Connect Gmail or Outlook in one click (or add a forwarding filter) and receipt emails reach UnReceipt on their own, read in seconds.",
      },
      {
        title: "Export or share",
        desc: "Download any month or year as a ZIP — CSV, PDFs and originals — or invite your accountant to see your receipts directly.",
      },
    ],
  },
  features: {
    eyebrow: "Made for one-person businesses",
    title: "Everything a freelancer needs, nothing more",
    items: [
      {
        icon: "mail",
        title: "A private receipt address",
        desc: "Forward any email receipt to it: software subscriptions, train tickets, hotel bookings.",
      },
      {
        icon: "camera",
        title: "Paper receipts in seconds",
        desc: "Photograph a receipt and merchant, date, total and VAT are filled in for you.",
      },
      {
        icon: "receipt",
        title: "VAT on every receipt",
        desc: "Amount and rate saved as they appear on the receipt, so the VAT is there when you need it.",
      },
      {
        icon: "globe",
        title: "Foreign currencies",
        desc: "A receipt in dollars, euros or pounds keeps its amount and gets an estimated home amount from the ECB rate of the purchase day.",
      },
      {
        icon: "download",
        title: "Your archive, your files",
        desc: "A ZIP per month, year or everything. If you stop, your receipts stay downloadable for 90 days.",
      },
      {
        icon: "clock",
        title: "One flat price",
        desc: "One monthly price for your business, sized by how many receipts you send. No bank connection, no new card.",
      },
    ],
  },
  related: {
    title: "Read next",
    links: [
      { label: "How long do you have to keep receipts?", page: "guideRetention" },
      { label: "Working with an accountant? See the firm side", page: "accountants" },
    ],
  },
  faqTitle: "Questions from freelancers",
  faq: [
    {
      q: "Is UnReceipt made for one-person businesses?",
      a: "Yes. UnReceipt is built for one-person businesses: one account with its own receipt address, every receipt in one place, and a monthly price sized by how many receipts you send.",
    },
    {
      q: "Do I need an accountant to use UnReceipt?",
      a: "No. You can keep everything in UnReceipt and download a ZIP for any month or year — a CSV, a PDF of every receipt and the originals — for your own bookkeeping or tax return. If you do have an accountant, invite them and they see your receipts directly.",
    },
    {
      q: "Can UnReceipt read receipts in other currencies?",
      a: "Yes. A receipt keeps its own currency and amount, and UnReceipt adds the amount in your home currency from the European Central Bank reference rate of the purchase day. You can also type the amount from your bank statement instead.",
    },
    {
      q: "Can receipt emails reach UnReceipt automatically?",
      a: "Yes. Connect your Gmail or Outlook inbox in one click and UnReceipt picks out the emails that look like a receipt, invoice or order confirmation; you confirm each one before it counts. Prefer not to connect? The setup guide gives you a ready-made filter that forwards receipt emails to your UnReceipt address.",
    },
    {
      q: "What happens to my receipts if I stop using UnReceipt?",
      a: "Your account and receipts stay available for 90 days after you cancel so you can download them, and we email you before anything is deleted. Keeping receipts for the legal period stays your business's duty, so move them to your own archive.",
    },
  ],
  ending: {
    title: "Stop losing receipts",
    lead: "Snap the next one and see it saved with its VAT in seconds.",
    primary: "signup",
    secondary: "demoCompany",
    secondaryLabel: "See the demo",
  },
  contactSubject: "UnReceipt question",
};

const freelancersSv: AudienceCopy = {
  meta: {
    title: "Kvittoapp för enskild firma och frilansare | UnReceipt",
    description:
      "Fota papperskvitton, vidarebefordra e-postkvitton och få varje utgift sparad med moms och kategori, redo för bokföringen och deklarationen. Byggt för enskild firma, konsulter och frilansare.",
    shareTitle: "UnReceipt för enskild firma — alla kvitton på plats före deklarationen",
    keywords: [
      "kvitton enskild firma",
      "kvittoapp enskild firma",
      "spara kvitton enskild firma",
      "kvittohantering frilansare",
      "bokföring kvitton enskild näringsidkare",
      "fota kvitton app",
      "digitala kvitton företag",
    ],
  },
  breadcrumb: "För enskild firma",
  audienceType: "Enskilda näringsidkare, konsulter och frilansare",
  hero: {
    eyebrow: "För enskild firma och frilansare",
    title: "Alla kvitton på plats,",
    accent: "före deklarationen.",
    lead: "Du driver firman och sköter bokföringen själv. UnReceipt tar hand om kvittona: fota papperskvittona, vidarebefordra e-postkvittona, och varje utgift sparas med moms, kategori och original — redo för bokföringen, deklarationen eller din redovisningskonsult.",
    primary: "signup",
    secondary: "demoCompany",
    secondaryLabel: "Se demon",
    notePilot: "Gratis under piloten. Därefter från {price}/mån.",
    notePaid: "Från {price}/mån exkl. moms efter gratisveckan. Avsluta när du vill.",
    notePilotNoPrice: "Gratis under piloten. Inget kort behövs.",
    notePaidNoPrice: "Första veckan gratis. Avsluta när du vill.",
  },
  panel: {
    title: "Den här månaden",
    caption: "Illustration med påhittade kvitton",
    rows: [
      { label: "SJ · Resor", value: "895,00 kr", done: true },
      { label: "Clas Ohlson · Kontor", value: "1 450,00 kr", done: true },
      { label: "Adobe · Programvara", value: "23,99 €", done: true },
      { label: "Uber · Transport", value: "189,00 kr", done: false },
    ],
  },
  compare: {
    eyebrow: "Skillnaden",
    title: "Ingen skokartong vid årsskiftet",
    oldTitle: "Det gamla sättet",
    old: [
      "Kvitton i plånboken, i bilen och i tre inkorgar",
      "En hög att sortera veckan innan deklarationen",
      "Prenumerationer i dollar och euro att räkna om för hand",
      "Betala redovisningskonsulten för att knappa in kvitton",
    ],
    newTitle: "Med UnReceipt",
    new: [
      "En kameraknapp, din egen kvittoadress och inkorgen kopplad en gång",
      "Varje kvitto sorterat efter datum och kategori direkt",
      "Utländska kvitton omräknade med ECB:s kurs för köpdagen",
      "Konsulten ser dina kvitton direkt, eller så exporterar du en ZIP",
    ],
  },
  steps: {
    eyebrow: "Så funkar det",
    title: "Igång på fem minuter",
    step: "STEG",
    items: [
      {
        title: "Fota eller vidarebefordra",
        desc: "Ta ett foto av papperskvittot — fälten fylls i automatiskt — eller vidarebefordra e-postkvittot till din privata UnReceipt-adress.",
      },
      {
        title: "Gör det automatiskt",
        desc: "Koppla Gmail eller Outlook med ett klick (eller lägg till ett filter för vidarebefordran) så kommer kvittomejlen till UnReceipt av sig själva, avlästa på sekunder.",
      },
      {
        title: "Exportera eller dela",
        desc: "Ladda ner valfri månad eller hela året som ZIP — CSV, PDF:er och original — eller bjud in din redovisningskonsult så ser hen kvittona direkt.",
      },
    ],
  },
  features: {
    eyebrow: "För enmansföretag",
    title: "Allt en enskild firma behöver, inget mer",
    items: [
      {
        icon: "mail",
        title: "En privat kvittoadress",
        desc: "Vidarebefordra alla e-postkvitton dit: programvara, tågbiljetter, hotell.",
      },
      {
        icon: "camera",
        title: "Papperskvitton på sekunder",
        desc: "Fota kvittot så fylls säljare, datum, belopp och moms i åt dig.",
      },
      {
        icon: "receipt",
        title: "Momsen på varje kvitto",
        desc: "Belopp och momssats sparas som de står på kvittot, så momsen finns där när du behöver den.",
      },
      {
        icon: "globe",
        title: "Utländsk valuta",
        desc: "Ett kvitto i dollar eller euro behåller sitt belopp och får beloppet i kronor från ECB:s kurs för köpdagen.",
      },
      {
        icon: "book",
        title: "Ditt eget arkiv",
        desc: "Kvittobild och PDF sparas för varje kvitto. Ladda ner en ZIP per månad, år eller allt när du vill. Bevarandeskyldigheten ligger hos firman, och om du avslutar finns kvittona kvar i 90 dagar.",
      },
      {
        icon: "clock",
        title: "Ett fast pris",
        desc: "Ett månadspris för firman, efter hur många kvitton du skickar. Ingen bankkoppling, inget nytt kort.",
      },
    ],
  },
  related: {
    title: "Läs mer",
    links: [
      { label: "Hur länge ska man spara kvitton?", page: "guideRetention" },
      { label: "Får man slänga papperskvitton?", page: "guidePaper" },
      { label: "Har du redovisningsbyrå? Så ser det ut för byrån", page: "accountants" },
    ],
  },
  faqTitle: "Frågor från enskilda firmor",
  faq: [
    {
      q: "Passar UnReceipt för en enskild firma?",
      a: "Ja. UnReceipt är byggt för enmansföretag: ett konto med en egen kvittoadress, alla kvitton på ett ställe och ett månadspris efter hur många kvitton du skickar.",
    },
    {
      q: "Måste en enskild firma spara kvitton?",
      a: "Ja. Alla som bedriver näringsverksamhet är bokföringsskyldiga, oavsett storlek, och kvittona ska sparas till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades. För en enskild firma är räkenskapsåret kalenderåret: kvitton från 2026 sparas alltså till och med 2033.",
    },
    {
      q: "Behöver jag en redovisningskonsult för att använda UnReceipt?",
      a: "Nej. Du kan ha allt i UnReceipt och ladda ner en ZIP för valfri månad eller hela året — en CSV, en PDF för varje kvitto och originalen — till din egen bokföring. Har du en redovisningskonsult kan du bjuda in hen så ser hen kvittona direkt.",
    },
    {
      q: "Klarar UnReceipt kvitton i utländsk valuta?",
      a: "Ja. Kvittot behåller sin valuta och sitt belopp, och UnReceipt lägger till beloppet i kronor från Europeiska centralbankens referenskurs för köpdagen. Du kan också skriva in beloppet från kontoutdraget i stället.",
    },
    {
      q: "Kan kvittomejl komma till UnReceipt automatiskt?",
      a: "Ja. Koppla din Gmail- eller Outlook-inkorg med ett klick så plockar UnReceipt ut mejlen som ser ut som ett kvitto, en faktura eller en orderbekräftelse; du bekräftar varje kvitto innan det räknas. Vill du inte koppla inkorgen? Guiden i appen ger dig ett färdigt filter som vidarebefordrar kvittomejl till din UnReceipt-adress.",
    },
  ],
  ending: {
    title: "Sluta tappa bort kvitton",
    lead: "Fota nästa kvitto och se det sparat med momsen på några sekunder.",
    primary: "signup",
    secondary: "demoCompany",
    secondaryLabel: "Se demon",
  },
  contactSubject: "Fråga om UnReceipt",
};

const freelancersFr: AudienceCopy = {
  meta: {
    title: "Application reçus pour indépendants et auto-entrepreneurs | UnReceipt",
    description:
      "Photographiez vos tickets, transférez vos reçus par e-mail et gardez chaque dépense classée avec sa TVA, prête pour votre comptabilité ou votre expert-comptable. Pour indépendants et micro-entrepreneurs.",
    shareTitle: "UnReceipt pour les indépendants — tous vos justificatifs au même endroit",
    keywords: [
      "application reçus indépendant",
      "gestion justificatifs auto-entrepreneur",
      "conserver tickets de caisse micro-entreprise",
      "scanner tickets de caisse application",
      "justificatifs de dépenses freelance",
      "classement des factures indépendant",
    ],
  },
  breadcrumb: "Indépendants",
  audienceType: "Indépendants, freelances et micro-entrepreneurs",
  hero: {
    eyebrow: "Pour les indépendants et micro-entrepreneurs",
    title: "Tous vos justificatifs,",
    accent: "classés sans y penser.",
    lead: "Vous faites tourner l’activité et vous tenez les comptes. UnReceipt s’occupe des reçus : photographiez vos tickets, transférez vos reçus par e-mail, et chaque dépense est enregistrée avec sa TVA, sa catégorie et l’original — prête pour votre comptabilité ou votre expert-comptable.",
    primary: "signup",
    secondary: "demoCompany",
    secondaryLabel: "Voir la démo",
    notePilot: "Gratuit pendant la phase pilote. Ensuite, à partir de {price} HT par mois.",
    notePaid: "À partir de {price} HT par mois après la semaine gratuite. Sans engagement.",
    notePilotNoPrice: "Gratuit pendant la phase pilote. Sans carte bancaire.",
    notePaidNoPrice: "Première semaine gratuite. Sans engagement.",
  },
  panel: {
    title: "Ce mois-ci",
    caption: "Illustration avec des reçus d’exemple",
    rows: [
      { label: "SNCF · Déplacements", value: "64,00 €", done: true },
      { label: "Fnac · Fournitures", value: "129,99 €", done: true },
      { label: "Adobe · Logiciels", value: "$22.99", done: true },
      { label: "Uber · Transport", value: "23,40 €", done: false },
    ],
  },
  compare: {
    eyebrow: "La différence",
    title: "Plus de boîte à chaussures en fin d’année",
    oldTitle: "Avant",
    old: [
      "Des tickets dans le portefeuille, la voiture et trois boîtes mail",
      "Une pile à trier la semaine de la déclaration",
      "Des abonnements en dollars à convertir à la main",
      "Payer votre comptable pour saisir des reçus",
    ],
    newTitle: "Avec UnReceipt",
    new: [
      "Un bouton photo, votre adresse de reçus et votre boîte mail connectée une fois",
      "Chaque reçu classé par date et catégorie dès son arrivée",
      "Reçus en devises convertis au taux BCE du jour de l’achat",
      "Votre expert-comptable voit vos reçus, ou vous exportez un ZIP",
    ],
  },
  steps: {
    eyebrow: "Comment ça marche",
    title: "Prêt en cinq minutes",
    step: "ÉTAPE",
    items: [
      {
        title: "Photographiez ou transférez",
        desc: "Prenez en photo un ticket — les champs se remplissent tout seuls — ou transférez un reçu par e-mail à votre adresse UnReceipt privée.",
      },
      {
        title: "Automatisez",
        desc: "Connectez Gmail ou Outlook en un clic (ou ajoutez un filtre de transfert) et vos reçus par e-mail arrivent seuls dans UnReceipt, lus en quelques secondes.",
      },
      {
        title: "Exportez ou partagez",
        desc: "Téléchargez un mois ou une année en ZIP — CSV, PDF et originaux — ou invitez votre expert-comptable à voir vos reçus directement.",
      },
    ],
  },
  features: {
    eyebrow: "Pensé pour les indépendants",
    title: "L’essentiel, rien de plus",
    items: [
      {
        icon: "mail",
        title: "Une adresse privée pour vos reçus",
        desc: "Transférez-y tous vos reçus par e-mail : logiciels, billets de train, hôtels.",
      },
      {
        icon: "camera",
        title: "Les tickets en quelques secondes",
        desc: "Photographiez un ticket : fournisseur, date, montant et TVA sont remplis pour vous.",
      },
      {
        icon: "receipt",
        title: "La TVA de chaque reçu",
        desc: "Montant et taux enregistrés tels qu’ils figurent sur le justificatif.",
      },
      {
        icon: "globe",
        title: "Les devises",
        desc: "Un reçu en dollars garde son montant et reçoit le montant en euros au taux BCE du jour de l’achat.",
      },
      {
        icon: "download",
        title: "Vos fichiers, votre archive",
        desc: "Un ZIP par mois, par année ou pour tout. Si vous arrêtez, vos reçus restent téléchargeables 90 jours.",
      },
      {
        icon: "clock",
        title: "Un prix fixe",
        desc: "Un prix mensuel pour votre activité, selon le nombre de reçus envoyés. Sans connexion bancaire, sans nouvelle carte.",
      },
    ],
  },
  related: {
    title: "À lire aussi",
    links: [
      { label: "Combien de temps conserver les justificatifs ?", page: "guideRetention" },
      { label: "Peut-on jeter les tickets de caisse après numérisation ?", page: "guidePaper" },
      { label: "Vous avez un expert-comptable ? Le côté cabinet", page: "accountants" },
    ],
  },
  faqTitle: "Les questions des indépendants",
  faq: [
    {
      q: "UnReceipt convient-il à un micro-entrepreneur ?",
      a: "Oui. UnReceipt est pensé pour les entreprises d’une personne : un compte avec sa propre adresse de réception, tous les reçus au même endroit, et un prix mensuel selon le nombre de reçus envoyés.",
    },
    {
      q: "Un micro-entrepreneur doit-il conserver ses justificatifs ?",
      a: "Oui. Le micro-entrepreneur tient un livre des recettes (et un registre des achats s’il vend des marchandises, des denrées à consommer sur place ou à emporter, ou fournit un logement) et conserve ses registres et pièces justificatives\u00a0: dix ans pour les commerçants (article L123-22 du Code de commerce), et au minimum le délai fiscal de l’article L102 B du Livre des procédures fiscales pour tous (six ans, dix ans à partir de 2027). Le plus simple\u00a0: tout garder dix ans.",
    },
    {
      q: "Faut-il un expert-comptable pour utiliser UnReceipt ?",
      a: "Non. Vous pouvez tout garder dans UnReceipt et télécharger un ZIP pour n’importe quel mois ou année — un CSV, un PDF de chaque reçu et les originaux — pour votre propre comptabilité. Si vous avez un expert-comptable, invitez-le : il voit vos reçus directement.",
    },
    {
      q: "UnReceipt lit-il les reçus en devises ?",
      a: "Oui. Le reçu garde sa devise et son montant, et UnReceipt ajoute le montant en euros au taux de référence de la Banque centrale européenne du jour de l’achat. Vous pouvez aussi saisir le montant de votre relevé bancaire.",
    },
    {
      q: "Puis-je jeter mes tickets papier ?",
      a: "Non, pas en France aujourd’hui : UnReceipt ne produit pas la copie conforme qu’exige le Livre des procédures fiscales pour détruire une facture papier. Gardez vos originaux ; UnReceipt sert à les lire, les classer et les retrouver.",
    },
  ],
  ending: {
    title: "Fini les reçus perdus",
    lead: "Photographiez le prochain ticket et retrouvez-le enregistré avec sa TVA en quelques secondes.",
    primary: "signup",
    secondary: "demoCompany",
    secondaryLabel: "Voir la démo",
  },
  contactSubject: "Question sur UnReceipt",
};

export const AUDIENCE_COPY: Record<AudienceId, Record<Locale, AudienceCopy>> = {
  accountants: { en: accountantsEn, sv: accountantsSv, fr: accountantsFr },
  freelancers: { en: freelancersEn, sv: freelancersSv, fr: freelancersFr },
};
