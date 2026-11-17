import type { FaqItem } from "@/lib/faq";
import type { Locale } from "@/lib/locale";
import type { MarketingPageId } from "@/lib/marketing-pages";

/**
 * Words for the audience pages: accounting firms (/accountants,
 * /sv/redovisningsbyra, /fr/experts-comptables), freelancers / sole
 * traders (/freelancers, /sv/enskild-firma, /fr/independants) and small
 * businesses with employees (/small-business, /sv/smaforetag, /fr/tpe).
 *
 * Every claim must be true of the product today (see AGENTS.md "Firm portal
 * auth", "Company team and approvals", "Currency", "Exports"). No testimonials, logos or numbers we can't
 * back. Prices come from plans.ts; `{price}` is filled with the cheapest
 * plan in the page's currency, and only while SHOW_PRICES is on.
 *
 * The FAQ answers here are also the page's FAQPage structured data and go
 * into /llms.txt, so they must read well on their own.
 */

export type AudienceId = "accountants" | "freelancers" | "smallBusiness";

/** Where a button goes; resolved to a URL in _audience-page.tsx. */
export type Cta = "signup" | "demoCompany" | "demoAccountant" | "contactFirm" | "bookDemo";

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
      "Get your clients' receipts read by AI, confirmed by the client and VAT-split in one portal. See what needs review per client, export a month for your bookkeeping, never book a receipt twice.",
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
    lead: "Stop chasing photos, forwarded PDFs and paper bags at month-end. Your clients snap or forward their receipts to UnReceipt; you get every one read by AI, confirmed by the client and VAT-split in one portal, with one export per client and month.",
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
      "Clients send each receipt when they pay: photo or forwarded email",
      "Merchant, date, VAT amount and rate already read and confirmed by the client",
      "Per client, you see which receipts still need a check",
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
        desc: "Invite a client company by email, or accept the invite a client sends you. The invited side always confirms from its own signed-in account.",
      },
      {
        title: "They send, we read",
        desc: "Clients snap paper receipts, forward email ones to their private address or connect Gmail or Outlook. AI reads each receipt in seconds, and the client checks and confirms it.",
      },
      {
        title: "You review and export",
        desc: "Open a client's month, complete what's missing, then export a ZIP: a bookkeeping file with one line per receipt and VAT rate, plus every PDF and original.",
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
        desc: "All linked companies, with the number of receipts waiting for a check next to each.",
      },
      {
        icon: "receipt",
        title: "VAT split per rate",
        desc: "Each receipt carries its VAT amount and rate; the bookkeeping file has one line per receipt and VAT rate.",
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
        icon: "globe",
        title: "Foreign currencies handled",
        desc: "A receipt in EUR, USD, GBP, NOK, DKK, ISK, CHF, PLN, CZK, HUF, RON or TRY keeps its own amount and gets an estimated kronor amount from the ECB rate of the purchase day, or the amount from the bank statement.",
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
      a: "Ask a client to invite you from UnReceipt (Settings → Your accountant) and accept with your work email: that creates your firm's portal. Or write to support@unreceipt.com and we'll set up your firm and walk you through it. From the portal you can then invite your other clients by email.",
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
      a: "Only the client itself and your firm's staff, and only for companies linked to your firm. Receipts are read by AI, not by people: UnReceipt's own staff look at a client's receipts only when the client asks for support, for security, or when the law requires it. A link exists only once the invited side has accepted it, signed in with the address the invite was sent to, and the client gets an email confirming every new link. Receipts are stored in the EU, in Frankfurt.",
    },
    {
      q: "Can I change the category or account of a receipt?",
      a: "Yes. You can complete and correct any receipt of a linked client, set the account it's booked on and mark it as booked. The account suggestions are only suggestions: whether a purchase is deductible remains your judgement.",
    },
    {
      q: "Is the portal in Swedish?",
      a: "The product is in English for now. The website is in English, Swedish and French.",
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
      "Få klienternas kvitton avlästa av AI, bekräftade av klienten och med momsen uppdelad i en portal. Se vad som behöver granskas per klient, exportera månaden med BAS-kontoförslag och bokför aldrig ett kvitto två gånger.",
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
    lead: "Sluta jaga foton, vidarebefordrade PDF:er och kvittopåsar vid månadsskiftet. Dina klienter fotar eller vidarebefordrar sina kvitton till UnReceipt, och du får varje kvitto avläst av AI, bekräftat av klienten och med momsen uppdelad i en portal, med en export per klient och månad.",
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
      "Klienten skickar kvittot direkt vid köpet: foto eller vidarebefordrat mejl",
      "Säljare, datum, momsbelopp och momssats redan avlästa och bekräftade av klienten",
      "Per klient ser du vilka kvitton som behöver granskas",
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
        desc: "Bjud in ett klientföretag via mejl, eller acceptera inbjudan som klienten skickar till dig. Den inbjudna parten bekräftar alltid från sitt eget inloggade konto.",
      },
      {
        title: "De skickar, vi läser av",
        desc: "Klienterna fotar papperskvitton, vidarebefordrar e-postkvitton till sin privata adress eller ansluter Gmail eller Outlook. AI läser av varje kvitto på några sekunder, och klienten ser över och bekräftar det.",
      },
      {
        title: "Du granskar och exporterar",
        desc: "Öppna klientens månad, komplettera det som saknas och exportera en ZIP: en bokföringsfil med en rad per kvitto och momssats, plus varje PDF och original.",
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
        desc: "Alla kopplade företag, med antalet kvitton som väntar på granskning bredvid varje.",
      },
      {
        icon: "receipt",
        title: "Momsen uppdelad per sats",
        desc: "Varje kvitto har momsbelopp och momssats; bokföringsfilen har en rad per kvitto och momssats.",
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
        icon: "globe",
        title: "Utländsk valuta klar",
        desc: "Ett kvitto i EUR, USD, GBP, NOK, DKK, ISK, CHF, PLN, CZK, HUF, RON eller TRY behåller sitt belopp och får ett uppskattat belopp i kronor från ECB:s referenskurs för köpdagen, eller beloppet från kontoutdraget.",
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
      a: "Be en klient bjuda in dig från UnReceipt (Settings → Your accountant) och acceptera med din jobbmejl: då skapas byråns portal. Eller mejla support@unreceipt.com så sätter vi upp byrån och visar hur det fungerar. Från portalen bjuder du sedan in dina andra klienter via mejl.",
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
      a: "Bara klienten själv och byråns personal, och bara för företag som är kopplade till byrån. Kvittona läses av AI, inte av människor: UnReceipts egen personal tittar på en klients kvitton bara om klienten ber om support, av säkerhetsskäl eller när lagen kräver det. En koppling finns först när den inbjudna parten har accepterat, inloggad med adressen som inbjudan skickades till, och klienten får ett mejl som bekräftar varje ny koppling. Kvittona lagras inom EU, i Frankfurt.",
    },
    {
      q: "Kan jag ändra kategori eller konto på ett kvitto?",
      a: "Ja. Du kan komplettera och rätta varje kvitto hos en kopplad klient, välja vilket konto det bokförs på och markera det som bokfört. Kontoförslagen är bara förslag: om ett köp är avdragsgillt avgör du.",
    },
    {
      q: "Finns portalen på svenska?",
      a: "Produkten är på engelska än så länge. Webbplatsen finns på svenska, engelska och franska.",
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
      "Recevez les reçus de vos clients lus par l’IA, confirmés par le client et avec la TVA relevée dans un portail cabinet. Voyez ce qui reste à revoir par client et exportez chaque mois CSV et justificatifs PDF.",
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
    lead: "Fini les relances, les photos floues et les sacs de tickets en fin de mois. Vos clients photographient ou transfèrent leurs reçus à UnReceipt ; vous les retrouvez lus par l’IA, confirmés par le client et avec la TVA relevée dans un seul portail, avec un export par client et par mois.",
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
      "Le client envoie chaque reçu au moment de l’achat : photo ou e-mail transféré",
      "Fournisseur, date, montant et taux de TVA déjà lus et confirmés par le client",
      "Pour chaque client, vous voyez les reçus à revoir",
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
        desc: "Invitez une entreprise cliente par e-mail, ou acceptez l’invitation qu’un client vous envoie. La partie invitée confirme toujours depuis son propre compte connecté.",
      },
      {
        title: "Ils envoient, nous lisons",
        desc: "Vos clients photographient leurs tickets, transfèrent leurs reçus par e-mail à leur adresse privée ou connectent Gmail ou Outlook. L’IA lit chaque reçu en quelques secondes, puis le client le vérifie et le confirme.",
      },
      {
        title: "Vous revoyez et exportez",
        desc: "Ouvrez le mois d’un client, complétez ce qui manque, puis exportez un ZIP : un CSV des reçus avec montants et TVA, chaque justificatif en PDF et les fichiers d’origine.",
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
        desc: "Toutes les entreprises reliées, avec le nombre de reçus qui attendent une vérification.",
      },
      {
        icon: "receipt",
        title: "La TVA relevée",
        desc: "Chaque reçu indique le montant et le taux de TVA tels qu’ils figurent sur le justificatif.",
      },
      {
        icon: "check",
        title: "Jamais saisi deux fois",
        desc: "Un export ne reprend que les reçus jamais exportés, et vous pouvez marquer chaque reçu comme comptabilisé avec sa référence.",
      },
      {
        icon: "globe",
        title: "Les devises gérées",
        desc: "Un reçu en SEK, USD, GBP, NOK, DKK, ISK, CHF, PLN, CZK, HUF, RON ou TRY garde son montant et reçoit un montant estimé en euros au taux de référence BCE du jour de l’achat, ou celui du relevé bancaire.",
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
      a: "Demandez à un client de vous inviter depuis UnReceipt (Settings → Your accountant) et acceptez avec votre e-mail professionnel : le portail de votre cabinet est créé. Ou écrivez à support@unreceipt.com et nous configurons votre cabinet avec vous. Depuis le portail, vous invitez ensuite vos autres clients par e-mail.",
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
      a: "Seuls le client lui-même et les collaborateurs de votre cabinet, et seulement pour les entreprises reliées au cabinet. Les reçus sont lus par une IA, pas par des personnes : l’équipe UnReceipt ne consulte les reçus d’un client que s’il demande de l’aide, pour des raisons de sécurité ou si la loi l’exige. Un lien n’existe qu’une fois accepté par la partie invitée, connectée avec l’adresse à laquelle l’invitation a été envoyée, et le client reçoit un e-mail qui confirme chaque nouveau lien. Les reçus sont hébergés dans l’UE, à Francfort.",
    },
    {
      q: "UnReceipt remplace-t-il le ticket papier ?",
      a: "Non, pas en France aujourd’hui. UnReceipt ne produit pas la copie conforme qu’exige l’article A102 B-2 du Livre des procédures fiscales pour détruire une facture papier : vos clients conservent leurs originaux papier. UnReceipt sert à les collecter, les lire et vous les transmettre.",
    },
    {
      q: "Le portail est-il en français ?",
      a: "L’application est pour l’instant en anglais. Le site est en français, en anglais et en suédois.",
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
      "One private address and a camera button",
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
        desc: "Connect Gmail or Outlook, or add one filter, and receipt emails reach UnReceipt on their own. Each one is read as it arrives and waits for your OK.",
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
      a: "Yes. The setup guide in the app gives you a ready-made Gmail or Outlook filter that forwards receipt emails to your private UnReceipt address, so you don't have to forward them one by one.",
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
      "En privat adress och en kameraknapp",
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
        desc: "Anslut Gmail eller Outlook, eller lägg till ett filter, så kommer kvittomejlen till UnReceipt av sig själva. Varje kvitto läses av direkt och väntar på ditt OK.",
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
      a: "Ja. Guiden i appen ger dig ett färdigt filter för Gmail eller Outlook som vidarebefordrar kvittomejl till din privata UnReceipt-adress, så att du slipper göra det ett i taget.",
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
      "Une adresse privée et un bouton photo",
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
        desc: "Connectez Gmail ou Outlook, ou ajoutez un filtre, et vos reçus par e-mail arrivent seuls dans UnReceipt. Chacun est lu dès son arrivée et attend votre feu vert.",
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

// ─── Small businesses with employees ─────────────────────────────────
// The team feature (AGENTS.md "Company team and approvals", 2026-11-15):
// employees send receipts for approval, the owner or the person's approver
// decides, approved own-money outlays are listed to pay back, and the
// accounting firm sees an employee's receipt only once approved. The limits
// in the FAQ ("Known gaps") must stay true: change them with the product.

const smallBusinessEn: AudienceCopy = {
  meta: {
    title: "Employee Receipts and Expense Approval for Small Businesses | UnReceipt",
    description:
      "Employees snap or forward their receipts and send them for approval. You approve, see what to pay back to whom, and your accountant gets approved receipts only.",
    shareTitle: "UnReceipt for small businesses — your team's receipts, approved and ready",
    keywords: [
      "employee expense approval",
      "employee receipts app",
      "expense claims small business",
      "approve employee expenses",
      "reimburse employee expenses",
      "receipt app for teams",
    ],
  },
  breadcrumb: "For small businesses",
  audienceType: "Small businesses with employees",
  hero: {
    eyebrow: "For small businesses with employees",
    title: "Your team's receipts,",
    accent: "approved and ready.",
    lead: "Stop chasing receipts and expense forms at month-end. Employees snap or forward their receipts and send them for approval. You approve with one tap, see who is owed what, and your accountant only gets what you approved.",
    primary: "bookDemo",
    primaryLabel: "Book a 20-minute demo",
    secondary: "demoCompany",
    secondaryLabel: "Try the demo",
    notePilot: "Free during the pilot. The team feature is new.",
    notePaid: "One price for the whole company, no per-user fees.",
  },
  panel: {
    title: "To approve",
    caption: "Illustration with sample receipts",
    rows: [
      { label: "Erik · Circle K", value: "812 kr · to approve", done: false },
      { label: "Sara · Taxi Stockholm", value: "Approved", done: true },
      { label: "To pay back", value: "2 people", done: false },
      { label: "Sent to your accountant", value: "14 approved", done: true },
    ],
  },
  compare: {
    eyebrow: "Month-end",
    title: "Outlays without the paper chase",
    oldTitle: "Without UnReceipt",
    old: [
      "Receipts in jacket pockets, cars and emails to the boss",
      "Expense forms filled in by hand at month-end",
      "Hard to see who is owed what",
      "Your accountant gets receipts nobody has approved",
    ],
    newTitle: "With UnReceipt",
    new: [
      "Employees snap the receipt when they pay, or forward the email",
      "Sent for approval, saying who paid: their own money or the company's card",
      "Outlays to pay back listed per person",
      "Your accountant sees an employee's receipt once it's approved",
    ],
  },
  steps: {
    eyebrow: "How it works",
    title: "Three steps for your team",
    step: "STEP",
    items: [
      {
        title: "Invite your team",
        desc: "Under Team, invite employees by email. Each one joins signed in with that address, and sees only their own receipts.",
      },
      {
        title: "They send, AI reads",
        desc: "An employee snaps a receipt or forwards the email, AI reads it in seconds, and they send it for approval, saying whether they paid with their own money or the company's card.",
      },
      {
        title: "You approve",
        desc: "You, or the approver you chose for that person, approve, send back with a note, or reject. Outlays to pay back are listed per person, and your accountant sees the receipt once it's approved.",
      },
    ],
  },
  features: {
    eyebrow: "Built for small teams",
    title: "What your company gets",
    items: [
      {
        icon: "camera",
        title: "Read by AI, original kept",
        desc: "Merchant, date, amount and VAT read from the photo or email in seconds. The photo or email is kept with every receipt.",
      },
      {
        icon: "users",
        title: "An approver per person",
        desc: "Owners approve anyone. Make a team lead an approver for the people you assign. Nobody approves their own receipt.",
      },
      {
        icon: "check",
        title: "Approve, send back or reject",
        desc: "Sending back or rejecting asks for a reason, so the employee knows what to fix. Every step is logged with who did it and when.",
      },
      {
        icon: "calculator",
        title: "Who is owed what",
        desc: "Approved receipts paid with an employee's own money are listed per person and currency. Pay them back, then mark them paid.",
      },
      {
        icon: "shield",
        title: "Your accountant sees approved receipts",
        desc: "Your accounting firm sees an employee's receipt only once it's approved, and exports it with the rest of the month.",
      },
      {
        icon: "layers",
        title: "One price for the company",
        desc: "No per-user fees. The price depends on how many receipts the company sends, not on how many people send them.",
      },
    ],
  },
  related: {
    title: "Also useful",
    links: [
      { label: "UnReceipt for accounting firms", page: "accountants" },
      { label: "How long do companies have to keep receipts?", page: "guideRetention" },
      { label: "Just you? UnReceipt for freelancers", page: "freelancers" },
    ],
  },
  faqTitle: "Questions from small businesses",
  faq: [
    {
      q: "Can employees send their receipts and outlays to UnReceipt?",
      a: "Yes. The owner invites them by email under Team, and each employee joins signed in with that address. They photograph receipts, forward email receipts to their own UnReceipt address or connect Gmail or Outlook; the receipts go to the company, not to a private account. They send each one for approval, saying whether they paid with their own money or the company's card.",
    },
    {
      q: "How does approving an outlay work?",
      a: "An owner can decide on anyone's receipts; an approver decides for the people assigned to them. They approve, send back with a note (the employee fixes it and sends it again) or reject with a reason. Nobody approves their own receipt, and every step is logged with who did it and when. If the amount, currency, date, merchant or who paid changes after approval, the receipt goes back for approval.",
    },
    {
      q: "We already use Fortnox Kvitto & Utlägg or Pleo. Why switch?",
      a: "Maybe you shouldn't. UnReceipt has no integration with Fortnox, Visma or any other bookkeeping program: the export is a CSV file, PDFs and the original files, which your accountant books from. It has no company cards and no bank connection. If your current tool already gives your accountant what they need, there is little to gain. UnReceipt fits when receipts arrive as photos and emails, you want to approve outlays without company cards, and your accounting firm wants every receipt read and checked per client and month in its own portal.",
    },
    {
      q: "Does UnReceipt pay employees back or make a payroll file?",
      a: "No. Approved receipts paid with an employee's own money are listed per person and currency under Team → To pay back. You pay them, for example with the salary, and mark them paid. There is no payout and no file for your payroll system yet.",
    },
    {
      q: "Who sees an employee's receipts?",
      a: "The employee sees only their own. The owners, and the approver assigned to that person, see a receipt once it's sent for approval. The accounting firm sees it once it's approved. Receipts are stored in the EU, in Frankfurt.",
    },
    {
      q: "What happens when someone leaves?",
      a: "Remove them from the team: their receipts stay with the company, and they can no longer change them. But if an employee deletes their own UnReceipt account, their receipts are deleted with it, approved ones too: the company keeps no copy yet. So have your accountant book or export the approved receipts every month.",
    },
    {
      q: "Is the team feature ready?",
      a: "It's new (November 2026) and part of the pilot. Today each person has one approver (or the owners), with no amount limits, no stand-in while someone is away and no second approver. The app is in English. Tell us what your team needs.",
    },
  ],
  ending: {
    title: "See it with your own team",
    lead: "20 minutes on a call, or two minutes in the demo, where you approve an employee's receipt.",
    primary: "bookDemo",
    primaryLabel: "Book a demo",
    secondary: "demoCompany",
    secondaryLabel: "Try the demo",
  },
  contactSubject: "UnReceipt demo for our company",
};

const smallBusinessSv: AudienceCopy = {
  meta: {
    title: "Utlägg och kvitton för anställda – godkänn i appen | UnReceipt",
    description:
      "De anställda fotar eller vidarebefordrar sina kvitton och skickar dem för godkännande. Du godkänner, ser vem som ska ha tillbaka vad, och redovisningsbyrån får bara godkända kvitton.",
    shareTitle: "UnReceipt för småföretag — de anställdas utlägg, godkända och klara",
    keywords: [
      "utlägg anställda",
      "attestera utlägg",
      "godkänna utlägg",
      "hantera utlägg småföretag",
      "kvitton anställda app",
      "utläggshantering",
      "kvittohantering småföretag",
    ],
  },
  breadcrumb: "För småföretag",
  audienceType: "Småföretag med anställda",
  hero: {
    eyebrow: "För småföretag med anställda",
    title: "De anställdas kvitton,",
    accent: "godkända och klara.",
    lead: "Sluta jaga kvitton och utläggsblanketter i slutet av månaden. De anställda fotar eller vidarebefordrar sina kvitton och skickar dem för godkännande. Du godkänner med ett tryck, ser vem som ska ha tillbaka vad, och redovisningsbyrån får bara det du har godkänt.",
    primary: "bookDemo",
    primaryLabel: "Boka en demo på 20 minuter",
    secondary: "demoCompany",
    secondaryLabel: "Testa demon",
    notePilot: "Gratis under piloten. Teamfunktionen är ny.",
    notePaid: "Ett pris för hela företaget, inga avgifter per användare.",
  },
  panel: {
    title: "Att godkänna",
    caption: "Illustration med påhittade kvitton",
    rows: [
      { label: "Erik · Circle K", value: "812 kr · att godkänna", done: false },
      { label: "Sara · Taxi Stockholm", value: "Godkänt", done: true },
      { label: "Att betala tillbaka", value: "2 personer", done: false },
      { label: "Till redovisningsbyrån", value: "14 godkända", done: true },
    ],
  },
  compare: {
    eyebrow: "Månadsskiftet",
    title: "Utlägg utan pappersjakt",
    oldTitle: "Utan UnReceipt",
    old: [
      "Kvitton i jackfickor, i bilen och i mejl till chefen",
      "Utläggsblanketter som fylls i för hand i slutet av månaden",
      "Svårt att se vem som ska ha tillbaka vad",
      "Byrån får kvitton som ingen har godkänt",
    ],
    newTitle: "Med UnReceipt",
    new: [
      "Den anställda fotar kvittot vid köpet eller vidarebefordrar mejlet",
      "Skickas för godkännande med uppgift om vem som betalade: egna pengar eller företagets kort",
      "Utlägg att betala tillbaka listade per person",
      "Byrån ser en anställds kvitto när det är godkänt",
    ],
  },
  steps: {
    eyebrow: "Så funkar det",
    title: "Tre steg för teamet",
    step: "STEG",
    items: [
      {
        title: "Bjud in teamet",
        desc: "Under Team bjuder du in de anställda med deras mejladress. Var och en går med inloggad med just den adressen och ser bara sina egna kvitton.",
      },
      {
        title: "De skickar, AI läser av",
        desc: "Den anställda fotar kvittot eller vidarebefordrar mejlet, AI läser av det på några sekunder, och hen skickar det för godkännande och anger om hen betalade med egna pengar eller med företagets kort.",
      },
      {
        title: "Du godkänner",
        desc: "Du, eller den du har valt som godkännare för personen, godkänner, skickar tillbaka med en kommentar eller avvisar. Utlägg att betala tillbaka listas per person, och byrån ser kvittot när det är godkänt.",
      },
    ],
  },
  features: {
    eyebrow: "Byggt för små team",
    title: "Det här får företaget",
    items: [
      {
        icon: "camera",
        title: "Avläst av AI, originalet sparat",
        desc: "Säljare, datum, belopp och moms läses av från fotot eller mejlet på några sekunder. Fotot eller mejlet sparas med varje kvitto.",
      },
      {
        icon: "users",
        title: "En godkännare per person",
        desc: "Ägare kan godkänna allas kvitton. Gör en arbetsledare till godkännare för de personer du väljer. Ingen godkänner sitt eget kvitto.",
      },
      {
        icon: "check",
        title: "Godkänn, skicka tillbaka eller avvisa",
        desc: "Den som skickar tillbaka eller avvisar skriver varför, så att den anställda vet vad som ska rättas. Varje steg loggas med vem som gjorde det och när.",
      },
      {
        icon: "calculator",
        title: "Vem ska ha tillbaka vad",
        desc: "Godkända kvitton som en anställd betalat med egna pengar listas per person och valuta. Betala tillbaka och markera dem som betalda.",
      },
      {
        icon: "shield",
        title: "Byrån ser godkända kvitton",
        desc: "Redovisningsbyrån ser en anställds kvitto först när det är godkänt, och exporterar det med resten av månaden.",
      },
      {
        icon: "layers",
        title: "Ett pris för företaget",
        desc: "Inga avgifter per användare. Priset beror på hur många kvitton företaget skickar, inte på hur många som skickar dem.",
      },
    ],
  },
  related: {
    title: "Bra att läsa",
    links: [
      { label: "UnReceipt för redovisningsbyråer", page: "accountants" },
      { label: "Hur länge ska man spara kvitton?", page: "guideRetention" },
      { label: "Får man slänga papperskvitton?", page: "guidePaper" },
      { label: "Bara du i firman? UnReceipt för enskild firma", page: "freelancers" },
    ],
  },
  faqTitle: "Frågor från småföretag",
  faq: [
    {
      q: "Kan de anställda skicka in sina kvitton och utlägg?",
      a: "Ja. Ägaren bjuder in dem via mejl under Team, och varje anställd går med inloggad med den adressen. De fotar kvitton, vidarebefordrar e-postkvitton till sin egen UnReceipt-adress eller ansluter Gmail eller Outlook; kvittona hamnar hos företaget, inte på ett privat konto. Varje kvitto skickas för godkännande med uppgift om de betalade med egna pengar eller med företagets kort.",
    },
    {
      q: "Kan vi attestera utlägg i UnReceipt?",
      a: "Ja. En ägare kan godkänna allas kvitton, och en godkännare de personer som är kopplade till hen. Kvittot godkänns, skickas tillbaka med en kommentar (den anställda rättar och skickar igen) eller avvisas med en motivering. Ingen godkänner sitt eget kvitto, och varje steg loggas med vem som gjorde det och när. Ändras belopp, valuta, datum, säljare eller vem som betalade efter godkännandet går kvittot tillbaka för ett nytt godkännande.",
    },
    {
      q: "Vi använder redan Fortnox Kvitto & Utlägg eller Pleo. Varför byta?",
      a: "Kanske ska ni inte det. UnReceipt har ingen koppling till Fortnox, Visma eller något annat bokföringsprogram: exporten är en CSV-fil, PDF:er och originalfilerna, som byrån bokför från. Det finns inga företagskort och ingen bankkoppling. Om ert nuvarande verktyg redan ger byrån det den behöver finns lite att vinna. UnReceipt passar när kvittona kommer som foton och mejl, när ni vill godkänna utlägg utan att skaffa företagskort, och när byrån vill se varje kvitto avläst och kontrollerat per klient och månad i en egen portal.",
    },
    {
      q: "Betalar UnReceipt ut utlägg eller gör en lönefil?",
      a: "Nej. Godkända kvitton som en anställd betalat med egna pengar listas per person och valuta under Team → To pay back. Ni betalar tillbaka, till exempel med lönen, och markerar dem som betalda. Det finns ingen utbetalning och ingen fil till lönesystemet än.",
    },
    {
      q: "Vem ser de anställdas kvitton?",
      a: "Den anställda ser bara sina egna. Ägarna, och den godkännare som är kopplad till personen, ser ett kvitto när det har skickats för godkännande. Redovisningsbyrån ser det när det är godkänt. Kvittona lagras inom EU, i Frankfurt.",
    },
    {
      q: "Vad händer när någon slutar?",
      a: "Ta bort personen ur teamet: hens kvitton stannar hos företaget, och hen kan inte längre ändra dem. Men om en anställd raderar sitt eget UnReceipt-konto raderas hens kvitton också, även de godkända: företaget behåller ingen kopia än. Låt därför byrån bokföra eller exportera de godkända kvittona varje månad.",
    },
    {
      q: "Är teamfunktionen klar att använda?",
      a: "Den är ny (november 2026) och ingår i piloten. I dag har varje person en godkännare (eller ägarna), utan beloppsgränser, utan ersättare när någon är borta och utan ett andra godkännande. Appen är på engelska; knapparna heter Approve, Send back och Reject. Berätta vad ert team behöver.",
    },
  ],
  ending: {
    title: "Se hur det fungerar med ert team",
    lead: "20 minuter i ett samtal, eller två minuter i demon där du godkänner en anställds kvitto.",
    primary: "bookDemo",
    primaryLabel: "Boka en demo",
    secondary: "demoCompany",
    secondaryLabel: "Testa demon",
  },
  contactSubject: "Demo av UnReceipt för vårt företag",
};

const smallBusinessFr: AudienceCopy = {
  meta: {
    title: "Notes de frais des salariés : validation et justificatifs | UnReceipt",
    description:
      "Vos salariés photographient ou transfèrent leurs reçus et les envoient pour validation. Vous validez, voyez qui rembourser, et votre expert-comptable ne reçoit que les reçus validés.",
    shareTitle: "UnReceipt pour les TPE — les notes de frais de vos salariés, validées et prêtes",
    keywords: [
      "notes de frais salariés",
      "validation notes de frais",
      "application notes de frais TPE",
      "remboursement frais salariés",
      "justificatifs salariés",
      "gestion des dépenses TPE",
    ],
  },
  breadcrumb: "TPE",
  audienceType: "TPE avec salariés",
  hero: {
    eyebrow: "Pour les TPE avec salariés",
    title: "Les notes de frais de vos salariés,",
    accent: "validées et prêtes.",
    lead: "Fini les tickets et les notes de frais à rassembler en fin de mois. Vos salariés photographient ou transfèrent leurs reçus et les envoient pour validation. Vous validez d’un geste, voyez qui rembourser, et votre expert-comptable ne reçoit que ce que vous avez validé.",
    primary: "bookDemo",
    primaryLabel: "Réserver une démo de 20 minutes",
    secondary: "demoCompany",
    secondaryLabel: "Essayer la démo",
    notePilot: "Gratuit pendant la phase pilote. La gestion d’équipe est nouvelle.",
    notePaid: "Un prix pour toute l’entreprise, sans frais par utilisateur.",
  },
  panel: {
    title: "À valider",
    caption: "Illustration avec des reçus fictifs",
    rows: [
      { label: "Lucas · TotalEnergies", value: "64,90 € · à valider", done: false },
      { label: "Camille · Taxi G7", value: "Validé", done: true },
      { label: "À rembourser", value: "2 personnes", done: false },
      { label: "Pour l’expert-comptable", value: "14 validés", done: true },
    ],
  },
  compare: {
    eyebrow: "La fin du mois",
    title: "Des notes de frais sans courir après les tickets",
    oldTitle: "Sans UnReceipt",
    old: [
      "Des tickets dans les poches, la voiture et les e-mails au patron",
      "Des notes de frais remplies à la main en fin de mois",
      "Difficile de savoir qui rembourser, et combien",
      "L’expert-comptable reçoit des reçus que personne n’a validés",
    ],
    newTitle: "Avec UnReceipt",
    new: [
      "Le salarié photographie le ticket en payant, ou transfère l’e-mail",
      "Envoyé pour validation, en indiquant qui a payé : lui-même ou la carte de l’entreprise",
      "Les frais à rembourser listés par personne",
      "L’expert-comptable voit le reçu d’un salarié une fois validé",
    ],
  },
  steps: {
    eyebrow: "Comment ça marche",
    title: "Trois étapes pour votre équipe",
    step: "ÉTAPE",
    items: [
      {
        title: "Invitez votre équipe",
        desc: "Dans Team, invitez vos salariés par e-mail. Chacun rejoint l’entreprise connecté avec cette adresse et ne voit que ses propres reçus.",
      },
      {
        title: "Ils envoient, l’IA lit",
        desc: "Le salarié photographie le ticket ou transfère l’e-mail, l’IA le lit en quelques secondes, et il l’envoie pour validation en indiquant s’il a payé lui-même ou avec la carte de l’entreprise.",
      },
      {
        title: "Vous validez",
        desc: "Vous, ou la personne que vous avez choisie pour valider ses frais, validez, renvoyez avec un commentaire ou refusez. Les frais à rembourser sont listés par personne, et l’expert-comptable voit le reçu une fois validé.",
      },
    ],
  },
  features: {
    eyebrow: "Pensé pour les petites équipes",
    title: "Ce que votre entreprise y gagne",
    items: [
      {
        icon: "camera",
        title: "Lu par l’IA, original conservé",
        desc: "Fournisseur, date, montant et TVA lus sur la photo ou l’e-mail en quelques secondes. La photo ou l’e-mail est conservé avec chaque reçu.",
      },
      {
        icon: "users",
        title: "Un valideur par personne",
        desc: "Les dirigeants valident les frais de tous. Désignez un responsable pour valider ceux des personnes de votre choix. Personne ne valide ses propres frais.",
      },
      {
        icon: "check",
        title: "Valider, renvoyer ou refuser",
        desc: "Renvoyer ou refuser demande un motif, pour que le salarié sache quoi corriger. Chaque étape est enregistrée avec son auteur et sa date.",
      },
      {
        icon: "calculator",
        title: "Qui rembourser, et combien",
        desc: "Les reçus validés payés par un salarié de sa poche sont listés par personne et par devise. Remboursez, puis marquez-les comme payés.",
      },
      {
        icon: "shield",
        title: "L’expert-comptable voit les reçus validés",
        desc: "Votre cabinet ne voit le reçu d’un salarié qu’une fois validé, et l’exporte avec le reste du mois.",
      },
      {
        icon: "layers",
        title: "Un prix pour l’entreprise",
        desc: "Sans frais par utilisateur. Le prix dépend du nombre de reçus envoyés par l’entreprise, pas du nombre de personnes qui les envoient.",
      },
    ],
  },
  related: {
    title: "À lire aussi",
    links: [
      { label: "UnReceipt pour les experts-comptables", page: "accountants" },
      { label: "Combien de temps conserver les justificatifs ?", page: "guideRetention" },
      { label: "Peut-on jeter les tickets de caisse après numérisation ?", page: "guidePaper" },
    ],
  },
  faqTitle: "Les questions des TPE",
  faq: [
    {
      q: "Mes salariés peuvent-ils envoyer leurs reçus et notes de frais ?",
      a: "Oui. Le dirigeant les invite par e-mail dans Team, et chaque salarié rejoint l’entreprise connecté avec cette adresse. Il photographie ses tickets, transfère ses reçus par e-mail à sa propre adresse UnReceipt ou connecte Gmail ou Outlook ; les reçus vont à l’entreprise, pas sur un compte personnel. Il envoie chacun pour validation en indiquant s’il a payé lui-même ou avec la carte de l’entreprise.",
    },
    {
      q: "Comment se passe la validation ?",
      a: "Un dirigeant peut décider pour tous ; un valideur décide pour les personnes qui lui sont rattachées. Il valide, renvoie avec un commentaire (le salarié corrige et renvoie) ou refuse avec un motif. Personne ne valide ses propres frais, et chaque étape est enregistrée avec son auteur et sa date. Si le montant, la devise, la date, le fournisseur ou le payeur change après validation, le reçu repart en validation.",
    },
    {
      q: "Nous utilisons déjà Pleo, Spendesk ou N2F. Pourquoi changer ?",
      a: "Peut-être que vous ne devriez pas. UnReceipt n’a pas d’intégration avec Pennylane ni avec aucun logiciel comptable : l’export est un fichier CSV, des PDF et les fichiers d’origine, que votre expert-comptable saisit. Il n’y a ni carte d’entreprise ni connexion bancaire. Si votre outil actuel donne déjà à votre cabinet ce dont il a besoin, il y a peu à gagner. UnReceipt convient quand les reçus arrivent en photo et par e-mail, que vous voulez valider les frais sans cartes d’entreprise, et que votre cabinet veut chaque reçu lu et vérifié par client et par mois dans son propre portail.",
    },
    {
      q: "UnReceipt rembourse-t-il les salariés ou prépare-t-il la paie ?",
      a: "Non. Les reçus validés payés par un salarié de sa poche sont listés par personne et par devise dans Team → To pay back. Vous le remboursez, par exemple avec le salaire, et les marquez comme payés. Il n’y a pas encore de virement ni de fichier pour la paie.",
    },
    {
      q: "Qui voit les reçus d’un salarié ?",
      a: "Le salarié ne voit que les siens. Les dirigeants, et le valideur rattaché à cette personne, voient un reçu une fois envoyé pour validation. L’expert-comptable le voit une fois validé. Les reçus sont stockés dans l’UE, à Francfort.",
    },
    {
      q: "Que se passe-t-il quand un salarié part ?",
      a: "Retirez-le de l’équipe : ses reçus restent à l’entreprise, et il ne peut plus les modifier. En revanche, si un salarié supprime son propre compte UnReceipt, ses reçus sont supprimés avec, même validés : l’entreprise n’en garde pas encore de copie. Faites donc saisir ou exporter les reçus validés chaque mois. Les tickets papier, eux, sont à conserver : UnReceipt ne produit pas la copie conforme qui permettrait de les jeter.",
    },
    {
      q: "La gestion d’équipe est-elle prête ?",
      a: "Elle est nouvelle (novembre 2026) et fait partie de la phase pilote. Aujourd’hui, chaque personne a un valideur (ou les dirigeants), sans seuil de montant, sans remplaçant en cas d’absence et sans double validation. L’application est en anglais. Dites-nous ce dont votre équipe a besoin.",
    },
  ],
  ending: {
    title: "Voyez-le avec votre équipe",
    lead: "20 minutes en appel, ou deux minutes dans la démo, où vous validez le reçu d’un salarié.",
    primary: "bookDemo",
    primaryLabel: "Réserver une démo",
    secondary: "demoCompany",
    secondaryLabel: "Essayer la démo",
  },
  contactSubject: "Démo UnReceipt pour notre entreprise",
};

export const AUDIENCE_COPY: Record<AudienceId, Record<Locale, AudienceCopy>> = {
  accountants: { en: accountantsEn, sv: accountantsSv, fr: accountantsFr },
  freelancers: { en: freelancersEn, sv: freelancersSv, fr: freelancersFr },
  smallBusiness: { en: smallBusinessEn, sv: smallBusinessSv, fr: smallBusinessFr },
};
