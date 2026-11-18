import type { Locale } from "@/lib/locale";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Every visible string on the landing page, per language. The layout,
 * icons and styling live in _landing.tsx and _pricing.tsx; this file is
 * only words, plus the example receipts each language shows. Fixed-length
 * tuples keep the languages in step: adding a feature in one language
 * without the others is a type error.
 *
 * The FAQ has its own page (`/faq`, answers in src/lib/faq.ts); prices
 * come from src/lib/plans.ts.
 */

type Item = { title: string; desc: string };
type Stat = { value: string; label: string };
type Four<T> = [T, T, T, T];
type Three<T> = [T, T, T];

type Category = "meals" | "software" | "office" | "travel" | "other" | "transport" | "accommodation";

/** Example receipts in the hero phone and the scrolling ticker. */
type Samples = {
  latest: { merchant: string; amount: string };
  today: Three<{ merchant: string; amount: string; time: string }>;
  photoCard: { merchant: string; amount: string };
  emailCard: { merchant: string; amount: string };
  ticker: { merchant: string; amount: string; category: Category; source: "photo" | "email" }[];
};

// Swedish shops in kronor, shown on the English and Swedish pages.
const SWEDISH_SAMPLES: Samples = {
  latest: { merchant: "ICA Maxi", amount: "342,00 kr" },
  today: [
    { merchant: "Uber", amount: "189,00 kr", time: "14:22" },
    { merchant: "Scandic Hotel", amount: "1 250,00 kr", time: "09:15" },
    { merchant: "SJ", amount: "895,00 kr", time: "08:30" },
  ],
  photoCard: { merchant: "Clas Ohlson", amount: "1 450,00 kr" },
  emailCard: { merchant: "Spotify", amount: "129,00 kr" },
  ticker: [
    { merchant: "ICA Maxi", amount: "342 kr", category: "meals", source: "photo" },
    { merchant: "Spotify", amount: "129 kr", category: "software", source: "email" },
    { merchant: "Clas Ohlson", amount: "1 450 kr", category: "office", source: "photo" },
    { merchant: "SJ", amount: "895 kr", category: "travel", source: "email" },
    { merchant: "Apoteket", amount: "212 kr", category: "other", source: "photo" },
    { merchant: "SAS", amount: "2 340 kr", category: "travel", source: "email" },
    { merchant: "Uber", amount: "189 kr", category: "transport", source: "email" },
    { merchant: "Pressbyr\u00e5n", amount: "68 kr", category: "meals", source: "photo" },
    { merchant: "Scandic Hotel", amount: "1 250 kr", category: "accommodation", source: "email" },
    { merchant: "Coop Konferens", amount: "890 kr", category: "meals", source: "photo" },
  ],
};

// French shops in euros, for the French page.
const FRENCH_SAMPLES: Samples = {
  latest: { merchant: "Paul", amount: "18,50\u00a0€" },
  today: [
    { merchant: "Uber", amount: "23,40\u00a0€", time: "14:22" },
    { merchant: "Ibis Paris", amount: "89,00\u00a0€", time: "09:15" },
    { merchant: "SNCF", amount: "64,00\u00a0€", time: "08:30" },
  ],
  photoCard: { merchant: "Fnac", amount: "129,99\u00a0€" },
  emailCard: { merchant: "Spotify", amount: "11,99\u00a0€" },
  ticker: [
    { merchant: "Monoprix", amount: "42,00\u00a0€", category: "meals", source: "photo" },
    { merchant: "Spotify", amount: "11,99\u00a0€", category: "software", source: "email" },
    { merchant: "Fnac", amount: "129,99\u00a0€", category: "office", source: "photo" },
    { merchant: "SNCF", amount: "64,00\u00a0€", category: "travel", source: "email" },
    { merchant: "Pharmacie", amount: "8,90\u00a0€", category: "other", source: "photo" },
    { merchant: "Air France", amount: "189,00\u00a0€", category: "travel", source: "email" },
    { merchant: "Uber", amount: "23,40\u00a0€", category: "transport", source: "email" },
    { merchant: "Relay", amount: "4,50\u00a0€", category: "meals", source: "photo" },
    { merchant: "Ibis Paris", amount: "89,00\u00a0€", category: "accommodation", source: "email" },
    { merchant: "Paul", amount: "18,50\u00a0€", category: "meals", source: "photo" },
  ],
};

type Ending =
  | {
      kind: "waitlist";
      badge: string;
      title: string;
      lead: string;
      success: string;
      placeholder: string;
      submit: string;
      submitting: string;
      errorGeneric: string;
      errorNetwork: string;
      skipPrefix: string;
    }
  | {
      kind: "cta";
      badge: string;
      title: string;
      leadPilot: string;
      leadPaid: string;
    };

export type LandingCopy = {
  hero: {
    /** The page's <h1>, shown as the small badge above the slogan: the search words. */
    seoTitle: string;
    titleLine1: string;
    titleLine2: string;
    titleAccent: string;
    lead: string;
    ctaPilot: string;
    ctaPaid: string;
    /** `{price}` is replaced with the cheapest plan's price. */
    notePilot: string;
    notePaid: string;
    /** Used instead while prices are hidden (src/lib/pricing-visibility.ts). */
    notePilotNoPrice: string;
    notePaidNoPrice: string;
  };
  phone: {
    verified: string;
    latestMeta: string;
    today: string;
    todayCount: string;
    snap: string;
    forwarded: string;
  };
  samples: Samples;
  stats: Four<Stat>;
  ticker: {
    verified: string;
    categories: Record<Category, string>;
  };
  features: { eyebrow: string; title: string; items: Three<Item> };
  how: { eyebrow: string; title: string; lead: string; step: string; items: Three<Item> };
  difference: {
    eyebrow: string;
    title: string;
    lead: string;
    oldTitle: string;
    old: Four<string>;
    newTitle: string;
    new: Four<string>;
  };
  pricing: {
    eyebrow: string;
    title: string;
    lead: string;
    slider: string;
    /** `{plan}` and `{price}` are filled in. */
    fits: string;
    fitsBadge: string;
    perMonth: string;
    /** `{n}` is the plan's receipt allowance. */
    upTo: string;
    /** `{price}` is the price of one receipt above the allowance. */
    overage: string;
    wholeCompany: string;
    who: Record<PlanId, string>;
    included: [string, string, string, string, string, string];
    notePilot: string;
    notePaid: string;
  };
  /** Who it's for: small businesses, freelancers, accounting firms (in that order). */
  about: { eyebrow: string; title: string; more: string; items: Three<Item> };
  badges: Four<string>;
  /**
   * The 20 s explainer loop near the end of the page (public/video/,
   * built in video/ as HeroLoop). Only languages with their own loop set it;
   * its text is burnt into the video.
   */
  video?: { eyebrow: string; title: string; lead: string };
  ending: Ending;
};

const en: LandingCopy = {
  hero: {
    seoTitle: "Receipt app for small businesses, freelancers & accountants",
    titleLine1: "From Chaos",
    titleLine2: "to Clarity —",
    titleAccent: "Automatically.",
    lead: "Built for small businesses and freelancers who hate chasing receipts — and for the accountants who chase them. Snap a receipt and AI reads it in seconds; email receipts arrive on their own. You check, confirm, and the VAT is ready.",
    ctaPilot: "Get started free",
    ctaPaid: "Start your free week",
    notePilot: "Free during the pilot. Plans from {price}/month after.",
    notePaid: "Plans from {price}/month + VAT after the free week. Cancel anytime.",
    notePilotNoPrice: "Free during the pilot. No card needed.",
    notePaidNoPrice: "First week free. Cancel anytime.",
  },
  phone: {
    verified: "Confirmed",
    latestMeta: "Meals · Moms 12% 36,64 kr",
    today: "Today",
    todayCount: "3 receipts",
    snap: "Snap a receipt",
    forwarded: "Forwarded",
  },
  samples: SWEDISH_SAMPLES,
  stats: [
    { value: "Seconds", label: "for AI to read a receipt photo" },
    { value: "1", label: "private receipt address for your company" },
    { value: "8", label: "expense categories, sorted for you" },
    { value: "0", label: "bank connections or new cards needed" },
  ],
  ticker: {
    verified: "Confirmed",
    categories: {
      meals: "Meals",
      software: "Software",
      office: "Office supplies",
      travel: "Travel",
      other: "Other",
      transport: "Transport",
      accommodation: "Accommodation",
    },
  },
  features: {
    eyebrow: "Why UnReceipt",
    title: "Focus on What Matters",
    items: [
      {
        title: "One Inbox for Every Receipt",
        desc: "Your company gets a private UnReceipt address. Forward email receipts to it, or snap paper ones with your phone.",
      },
      {
        title: "Every Line, VAT Included",
        desc: "Merchant, date, line items, VAT amount and rate — read by AI in seconds, checked by you, then saved.",
      },
      {
        title: "Find Anything, Keep Everything",
        desc: "Receipts sorted by date and category. Open any one to see the receipt image, or download it as a PDF for your accountant.",
      },
    ],
  },
  how: {
    eyebrow: "How it Works",
    title: "Three Steps. No Setup.",
    lead: "No bank connection, no new card. Just send us your receipts.",
    step: "STEP",
    items: [
      {
        title: "Forward or snap",
        desc: "Snap a paper receipt, forward email ones to your private address, or connect Gmail or Outlook so they arrive on their own.",
      },
      {
        title: "AI reads, you confirm",
        desc: "AI reads each receipt in seconds: merchant, date, category and the VAT split by rate. You check the fields and confirm.",
      },
      {
        title: "Ready for your accountant",
        desc: "Every receipt waits in your dashboard, VAT-ready, with the receipt image and a PDF one click away.",
      },
    ],
  },
  difference: {
    eyebrow: "The Difference",
    title: "Paper Fades. Simplicity Stays.",
    lead: "Why small businesses switch to UnReceipt",
    oldTitle: "The old way",
    old: [
      "Paper receipts lost in wallets and cars",
      "Email receipts buried across inboxes",
      "Typing amounts and VAT into spreadsheets",
      "Chasing colleagues for receipts at month-end",
    ],
    newTitle: "UnReceipt",
    new: [
      "One private address for every receipt",
      "Paper receipts captured with a photo",
      "VAT split out by rate, automatically",
      "Everything in one dashboard, receipt image included",
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Pay for the receipts you send",
    lead: "One monthly price for your whole company — no per-user fees. Pick the plan that covers how many receipts you send us each month.",
    slider: "Receipts per month",
    fits: "{plan} fits you — {price} / month excl. VAT.",
    fitsBadge: "Fits you",
    perMonth: "/ month excl. VAT",
    upTo: "Up to {n} receipts / month",
    overage: "Then {price} per extra receipt",
    wholeCompany: "Whole company included, no per-user fees.",
    // English plan descriptions live with the plans themselves.
    who: Object.fromEntries(PLANS.map((p) => [p.id, p.who])) as Record<PlanId, string>,
    included: [
      "Private address — forward any receipt",
      "Photo capture with auto-fill",
      "Receipts read by AI in seconds",
      "Receipt image + PDF for every receipt",
      "Email receipts read as soon as they arrive",
      "Cancel anytime",
    ],
    notePilot: "Free during the pilot. The prices above apply once the pilot ends. All prices excl. VAT; Swedish companies pay 25% moms on top, EU companies with a VAT number are reverse-charged.",
    notePaid: "First week free on every plan. All prices excl. VAT; Swedish companies pay 25% moms on top, EU companies with a VAT number are reverse-charged.",
  },
  about: {
    eyebrow: "Who it's for",
    title: "One App for the Business and Its Accountant",
    more: "Learn more",
    items: [
      {
        title: "Small Businesses",
        desc: "Forward email receipts and snap paper ones. Employees send theirs for your approval, and whoever does the books finds them in one place, with merchant, category and VAT ready.",
      },
      {
        title: "Freelancers & Sole Traders",
        desc: "Every receipt sorted as it arrives, ready for your tax return or your accountant. One flat monthly price.",
      },
      {
        title: "Accounting Firms",
        desc: "Every client's receipts read by AI, confirmed by the client and VAT-split in one portal, with a monthly export for your bookkeeping.",
      },
    ],
  },
  badges: [
    "Private Address per Company",
    "Receipt Image Saved",
    "PDF for Every Receipt",
    "Cancel Anytime",
  ],
  video: {
    eyebrow: "In 20 seconds",
    title: "See How It Works",
    lead: "One receipt, from your pocket to your accountant.",
  },
  ending: {
    kind: "waitlist",
    badge: "Not in Sweden yet?",
    title: "Get notified when we launch in your country",
    lead: "UnReceipt is in pilot in Sweden today. Drop your email and we'll let you know the moment we open in your market.",
    success: "You're on the list! We'll be in touch.",
    placeholder: "your@company.com",
    submit: "Notify me",
    submitting: "Joining...",
    errorGeneric: "Something went wrong. Please try again.",
    errorNetwork: "Couldn't reach us. Check your connection and try again.",
    skipPrefix: "In Sweden? Skip the list and",
  },
};

const sv: LandingCopy = {
  hero: {
    seoTitle: "Kvittohantering för småföretag, enskild firma och redovisningsbyråer",
    titleLine1: "Från kaos",
    titleLine2: "till klarhet —",
    titleAccent: "automatiskt.",
    lead: "Byggt för småföretag och enskilda firmor som är trötta på att jaga kvitton — och för redovisningsbyråerna som jagar dem. Fota kvittot så läser AI av det på några sekunder, och e-postkvittona kommer av sig själva. Du bekräftar, och momsen är klar.",
    ctaPilot: "Kom igång gratis",
    ctaPaid: "Prova gratis i en vecka",
    notePilot: "Gratis under piloten. Därefter från {price}/mån.",
    notePaid: "Från {price}/mån exkl. moms efter gratisveckan. Avsluta när du vill.",
    notePilotNoPrice: "Gratis under piloten. Inget kort behövs.",
    notePaidNoPrice: "Första veckan gratis. Avsluta när du vill.",
  },
  phone: {
    verified: "Bekräftat",
    latestMeta: "Måltider · Moms 12 % 36,64 kr",
    today: "Idag",
    todayCount: "3 kvitton",
    snap: "Fota ett kvitto",
    forwarded: "Vidarebefordrat",
  },
  samples: SWEDISH_SAMPLES,
  stats: [
    { value: "Sekunder", label: "tar det för AI att läsa av ett kvittofoto" },
    { value: "1", label: "privat kvittoadress för ditt företag" },
    { value: "8", label: "utgiftskategorier — kvittona sorteras åt dig" },
    { value: "0", label: "bankkopplingar eller nya kort behövs" },
  ],
  ticker: {
    verified: "Bekräftat",
    categories: {
      meals: "Måltider",
      software: "Programvara",
      office: "Kontorsmaterial",
      travel: "Resor",
      other: "Övrigt",
      transport: "Transport",
      accommodation: "Logi",
    },
  },
  features: {
    eyebrow: "Varför UnReceipt",
    title: "Fokusera på det som är viktigt",
    items: [
      {
        title: "En inkorg för alla kvitton",
        desc: "Ditt företag får en privat UnReceipt-adress. Vidarebefordra e-postkvitton dit, eller fota papperskvitton med mobilen.",
      },
      {
        title: "Varje rad, med moms",
        desc: "Säljare, datum, kvittorader, momsbelopp och momssats — avläst av AI på sekunder, kontrollerat av dig och sparat.",
      },
      {
        title: "Hitta allt, spara allt",
        desc: "Kvitton sorterade efter datum och kategori. Öppna vilket som helst för att se kvittobilden, eller ladda ner det som PDF till din redovisningskonsult.",
      },
    ],
  },
  how: {
    eyebrow: "Så funkar det",
    title: "Tre steg. Ingen installation.",
    lead: "Ingen bankkoppling, inget nytt kort. Skicka bara dina kvitton till oss.",
    step: "STEG",
    items: [
      {
        title: "Vidarebefordra eller fota",
        desc: "Fota ett papperskvitto, vidarebefordra e-postkvitton till din privata adress eller anslut Gmail eller Outlook så kommer de av sig själva.",
      },
      {
        title: "AI läser, du bekräftar",
        desc: "AI läser av varje kvitto på några sekunder: säljare, datum, kategori och momsen uppdelad per momssats. Du ser över fälten och bekräftar.",
      },
      {
        title: "Klart för din redovisningskonsult",
        desc: "Varje kvitto väntar i din översikt med momsen uppdelad, kvittobilden och en PDF ett klick bort.",
      },
    ],
  },
  difference: {
    eyebrow: "Skillnaden",
    title: "Papper bleknar. Enkelheten består.",
    lead: "Därför byter småföretag till UnReceipt",
    oldTitle: "Det gamla sättet",
    old: [
      "Papperskvitton som försvinner i plånböcker och bilar",
      "E-postkvitton begravda i olika inkorgar",
      "Belopp och moms som knappas in i kalkylark",
      "Jakt på kollegornas kvitton vid månadsskiftet",
    ],
    newTitle: "UnReceipt",
    new: [
      "En privat adress för alla kvitton",
      "Papperskvitton fångas med ett foto",
      "Momsen uppdelad per momssats, automatiskt",
      "Allt i en översikt, med kvittobilden",
    ],
  },
  pricing: {
    eyebrow: "Priser",
    title: "Betala för kvittona du skickar",
    lead: "Ett månadspris för hela företaget — inga avgifter per användare. Välj planen som täcker hur många kvitton du skickar till oss varje månad.",
    slider: "Kvitton per månad",
    fits: "{plan} passar dig — {price} / mån exkl. moms.",
    fitsBadge: "Passar dig",
    perMonth: "/ mån exkl. moms",
    upTo: "Upp till {n} kvitton / mån",
    overage: "Därefter {price} per extra kvitto",
    wholeCompany: "Hela företaget ingår, inga avgifter per användare.",
    who: {
      light: "Frilansare och företag med 1–3 personer.",
      regular: "Team på upp till cirka 20 personer.",
      heavy: "Team på upp till cirka 50 personer, eller som reser mycket.",
    },
    included: [
      "Privat adress — vidarebefordra vilket kvitto som helst",
      "Fota kvitton, fälten fylls i automatiskt",
      "AI läser av kvittot på några sekunder",
      "Kvittobild + PDF för varje kvitto",
      "E-postkvitton läses av direkt när de kommer",
      "Avsluta när du vill",
    ],
    notePilot: "Gratis under piloten. Priserna ovan gäller när piloten är slut. Alla priser exkl. moms; svenska företag betalar 25 % moms ovanpå, EU-företag med momsregistreringsnummer faktureras med omvänd skattskyldighet.",
    notePaid: "Första veckan gratis på alla planer. Alla priser exkl. moms; svenska företag betalar 25 % moms ovanpå, EU-företag med momsregistreringsnummer faktureras med omvänd skattskyldighet.",
  },
  about: {
    eyebrow: "För vem",
    title: "En app för företaget och redovisningsbyrån",
    more: "Läs mer",
    items: [
      {
        title: "Småföretag",
        desc: "Vidarebefordra e-postkvitton och fota papperskvitton. De anställda skickar sina för ditt godkännande, och den som sköter bokföringen hittar dem på ett ställe, med säljare, kategori och moms klart.",
      },
      {
        title: "Enskild firma och frilansare",
        desc: "Varje kvitto sorterat direkt, redo för deklarationen eller din redovisningskonsult. Ett fast månadspris.",
      },
      {
        title: "Redovisningsbyråer",
        desc: "Alla klienters kvitton avlästa av AI, bekräftade av klienten och med momsen uppdelad i en portal, med en månadsexport till bokföringen.",
      },
    ],
  },
  badges: [
    "Privat adress per företag",
    "Kvittobilden sparas",
    "PDF för varje kvitto",
    "Avsluta när du vill",
  ],
  ending: {
    kind: "cta",
    badge: "Paper is Past",
    title: "Sluta jaga kvitton",
    leadPilot: "UnReceipt är gratis medan piloten pågår.",
    leadPaid: "Prova gratis i en vecka. Avsluta när du vill.",
  },
};

const fr: LandingCopy = {
  hero: {
    seoTitle: "Gestion des justificatifs pour TPE, indépendants et experts-comptables",
    titleLine1: "Du chaos",
    titleLine2: "à la clarté —",
    titleAccent: "automatiquement.",
    lead: "Conçu pour les TPE et les indépendants qui en ont assez de courir après les justificatifs — et pour les experts-comptables qui les réclament. Photographiez un ticket, l’IA le lit en quelques secondes\u00a0; vos reçus par e-mail arrivent tout seuls. Vous confirmez, la TVA est relevée.",
    ctaPilot: "Commencer gratuitement",
    ctaPaid: "Essayer gratuitement une semaine",
    notePilot: "Gratuit pendant la phase pilote. Ensuite, à partir de {price}\u00a0HT par mois.",
    notePaid: "À partir de {price}\u00a0HT par mois après la semaine gratuite. Sans engagement.",
    notePilotNoPrice: "Gratuit pendant la phase pilote. Sans carte bancaire.",
    notePaidNoPrice: "Première semaine gratuite. Sans engagement.",
  },
  phone: {
    verified: "Confirmé",
    latestMeta: "Repas · TVA 10 % 1,68 €",
    today: "Aujourd’hui",
    todayCount: "3 reçus",
    snap: "Photographier un ticket",
    forwarded: "Transféré",
  },
  samples: FRENCH_SAMPLES,
  stats: [
    { value: "Secondes", label: "pour que l’IA lise la photo d’un reçu" },
    { value: "1", label: "adresse privée pour les reçus de votre entreprise" },
    { value: "8", label: "catégories de dépenses — vos reçus sont triés pour vous" },
    { value: "0", label: "connexion bancaire ou nouvelle carte nécessaire" },
  ],
  ticker: {
    verified: "Confirmé",
    categories: {
      meals: "Repas",
      software: "Logiciels",
      office: "Fournitures",
      travel: "Déplacements",
      other: "Autre",
      transport: "Transport",
      accommodation: "Hébergement",
    },
  },
  features: {
    eyebrow: "Pourquoi UnReceipt",
    title: "Concentrez-vous sur l’essentiel",
    items: [
      {
        title: "Une seule adresse pour tous vos reçus",
        desc: "Votre entreprise reçoit une adresse UnReceipt privée. Transférez-y vos reçus par e-mail, ou photographiez vos tickets papier avec votre téléphone.",
      },
      {
        title: "Chaque ligne, avec la TVA du ticket",
        desc: "Fournisseur, date, lignes, montant et taux de TVA — lus par l’IA en quelques secondes, vérifiés par vous, puis enregistrés.",
      },
      {
        title: "Tout retrouver, au même endroit",
        desc: "Vos reçus triés par date et par catégorie. Ouvrez-en un pour voir le reçu d’origine, ou téléchargez-le en PDF pour votre expert-comptable.",
      },
    ],
  },
  how: {
    eyebrow: "Comment ça marche",
    title: "Trois étapes. Aucune installation.",
    lead: "Pas de connexion bancaire, pas de nouvelle carte. Envoyez-nous simplement vos reçus.",
    step: "ÉTAPE",
    items: [
      {
        title: "Transférez ou photographiez",
        desc: "Photographiez un ticket papier, transférez vos reçus par e-mail à votre adresse privée, ou connectez Gmail ou Outlook pour qu’ils arrivent tout seuls.",
      },
      {
        title: "L’IA lit, vous confirmez",
        desc: "L’IA lit chaque reçu en quelques secondes\u00a0: fournisseur, date, catégorie et TVA ventilée par taux. Vous vérifiez les champs et vous confirmez.",
      },
      {
        title: "Prêt pour votre expert-comptable",
        desc: "Chaque reçu vous attend dans votre tableau de bord, TVA relevée, avec le reçu d’origine et un PDF à portée de clic.",
      },
    ],
  },
  difference: {
    eyebrow: "La différence",
    title: "Le papier s’efface. La simplicité reste.",
    lead: "Pourquoi les petites entreprises passent à UnReceipt",
    oldTitle: "Avant",
    old: [
      "Des tickets perdus dans les portefeuilles et les voitures",
      "Des reçus par e-mail éparpillés dans plusieurs boîtes",
      "Des montants et de la TVA saisis à la main dans un tableur",
      "Des relances aux collègues en fin de mois",
    ],
    newTitle: "UnReceipt",
    new: [
      "Une adresse privée pour tous vos reçus",
      "Les tickets papier capturés en une photo",
      "La TVA relevée taux par taux, automatiquement",
      "Tout dans un tableau de bord, avec le reçu d’origine",
    ],
  },
  pricing: {
    eyebrow: "Tarifs",
    title: "Payez pour les reçus que vous envoyez",
    lead: "Un prix mensuel pour toute l’entreprise — sans frais par utilisateur. Choisissez la formule qui couvre le nombre de reçus que vous nous envoyez chaque mois.",
    slider: "Reçus par mois",
    fits: "{plan} vous convient — {price}\u00a0HT/mois.",
    fitsBadge: "Pour vous",
    perMonth: "HT/mois",
    upTo: "Jusqu’à {n} reçus / mois",
    overage: "Puis {price}\u00a0HT par reçu supplémentaire",
    wholeCompany: "Toute l’entreprise incluse, sans frais par utilisateur.",
    who: {
      light: "Indépendants et entreprises de 1 à 3 personnes.",
      regular: "Équipes jusqu’à une vingtaine de personnes.",
      heavy: "Équipes jusqu’à une cinquantaine de personnes, ou qui voyagent beaucoup.",
    },
    included: [
      "Adresse privée — transférez n’importe quel reçu",
      "Photo avec remplissage automatique",
      "Reçus lus par l’IA en quelques secondes",
      "Reçu d’origine + PDF pour chaque reçu",
      "Reçus par e-mail lus dès leur arrivée",
      "Sans engagement",
    ],
    notePilot: "Gratuit pendant la phase pilote. Les prix ci-dessus s’appliqueront à la fin du pilote. Tous les prix sont hors taxes\u00a0; la TVA applicable est calculée au paiement.",
    notePaid: "Première semaine gratuite sur toutes les formules. Tous les prix sont hors taxes\u00a0; la TVA applicable est calculée au paiement.",
  },
  about: {
    eyebrow: "Pour qui",
    title: "Une application pour l’entreprise et son expert-comptable",
    more: "En savoir plus",
    items: [
      {
        title: "TPE",
        desc: "Transférez vos reçus par e-mail, photographiez vos tickets. Vos salariés envoient les leurs pour validation, et celui qui tient la comptabilité les retrouve au même endroit, avec fournisseur, catégorie et TVA.",
      },
      {
        title: "Indépendants",
        desc: "Chaque reçu classé dès son arrivée, prêt pour votre comptabilité ou votre expert-comptable. Un prix mensuel fixe.",
      },
      {
        title: "Experts-comptables",
        desc: "Les reçus de tous vos clients lus par l’IA, confirmés par le client et avec la TVA relevée dans un seul portail, avec un export mensuel pour la saisie.",
      },
    ],
  },
  badges: [
    "Adresse privée par entreprise",
    "Reçu d’origine consultable",
    "Un PDF pour chaque reçu",
    "Sans engagement",
  ],
  ending: {
    kind: "cta",
    badge: "Le papier, c’est du passé",
    title: "Fini la chasse aux reçus",
    leadPilot: "UnReceipt est gratuit pendant la phase pilote.",
    leadPaid: "Essayez gratuitement pendant une semaine. Sans engagement.",
  },
};

export const LANDING_COPY: Record<Locale, LandingCopy> = { en, sv, fr };

export { fill } from "@/lib/fill";
