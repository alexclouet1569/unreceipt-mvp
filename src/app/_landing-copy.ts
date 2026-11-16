import type { Locale } from "@/lib/locale";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Every visible string on the landing page, per language. The layout,
 * icons and styling live in _landing.tsx and _pricing.tsx; this file is
 * only words, plus the example receipts each language shows. Fixed-length
 * tuples keep the languages in step: adding a feature in one language
 * without the others is a type error.
 *
 * FAQ answers live in src/lib/faq.ts (shared with structured data and
 * /llms.txt); prices come from src/lib/plans.ts.
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
  nav: {
    backToTop: string;
    how: string;
    pricing: string;
    about: string;
    faq: string;
    signIn: string;
    ctaPilot: string;
    ctaPaid: string;
    openMenu: string;
    closeMenu: string;
  };
  hero: {
    /** The page's <h1>, shown as the small badge above the slogan: the search words. */
    seoTitle: string;
    titleLine1: string;
    titleLine2: string;
    titleAccent: string;
    lead: string;
    ctaPilot: string;
    ctaPaid: string;
    secondary: string;
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
  /** Who it's for: small businesses, freelancers, accounting firms (in that order). `lead` carries the mission. */
  about: { eyebrow: string; title: string; lead: string; more: string; items: Three<Item> };
  faq: { eyebrow: string; title: string };
  badges: Four<string>;
  ending: Ending;
};

const en: LandingCopy = {
  nav: {
    backToTop: "UnReceipt — back to top",
    how: "How it Works",
    pricing: "Pricing",
    about: "Who it's for",
    faq: "FAQ",
    signIn: "Sign in",
    ctaPilot: "Join the pilot",
    ctaPaid: "Start free",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  hero: {
    seoTitle: "Receipt app for small businesses and their accountants",
    titleLine1: "Every receipt.",
    titleLine2: "Already with",
    titleAccent: "your accountant.",
    lead: "Snap a receipt, forward it, or connect Gmail or Outlook once. UnReceipt reads each one in seconds, VAT included, and your accountant sees it right away — no more chasing at month-end, on either side.",
    ctaPilot: "Join the pilot",
    ctaPaid: "Start your free week",
    secondary: "See the demo",
    notePilot: "Free during the pilot. Plans from {price}/month after.",
    notePaid: "Plans from {price}/month + VAT after the free week. Cancel anytime.",
    notePilotNoPrice: "Free during the pilot. No card needed.",
    notePaidNoPrice: "First week free. Cancel anytime.",
  },
  phone: {
    verified: "Verified",
    latestMeta: "Meals · Moms 12% 36,64 kr",
    today: "Today",
    todayCount: "3 receipts",
    snap: "Snap a receipt",
    forwarded: "Forwarded",
  },
  samples: SWEDISH_SAMPLES,
  stats: [
    { value: "Seconds", label: "from photo to a filled-in receipt" },
    { value: "3", label: "ways in: photo, forwarded email or connected inbox" },
    { value: "1", label: "place for you, your team and your accountant" },
    { value: "0", label: "bank logins or new cards needed" },
  ],
  ticker: {
    verified: "Verified",
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
    title: "Send It Once. It's Handled.",
    items: [
      {
        title: "Every Way In",
        desc: "Snap paper receipts in the iPhone app or the browser, forward email ones to your own UnReceipt address, or connect Gmail or Outlook and they arrive by themselves. A whole pile? Upload up to 50 at once.",
      },
      {
        title: "Read in Seconds, VAT Included",
        desc: "Merchant, date, line items, VAT rate and amount are read for you, and foreign receipts get a home-currency amount at the ECB rate. Anything uncertain waits for one tap to confirm.",
      },
      {
        title: "Your Accountant, Already in the Loop",
        desc: "Your accountant sees your receipts as they arrive, checks them against your bank statement and exports them for the books. No ZIP files to send, no month-end chase.",
      },
    ],
  },
  how: {
    eyebrow: "How it Works",
    title: "Three Steps. Five Minutes.",
    lead: "No bank login, no new card, nothing to install on a computer.",
    step: "STEP",
    items: [
      {
        title: "Connect with your accountant",
        desc: "Invite your accountant from Settings, or open the link they send you and press Yes, share. No accountant? Skip this step and export yourself.",
      },
      {
        title: "Send receipts as you pay",
        desc: "Snap the paper ones, forward or auto-collect the email ones. Each is read in seconds; you confirm the uncertain ones against the original.",
      },
      {
        title: "Ready to book",
        desc: "Your accountant sees every receipt, spots bank payments that still miss one, and exports the month with its VAT lines.",
      },
    ],
  },
  difference: {
    eyebrow: "The Difference",
    title: "Paper Fades. Simplicity Stays.",
    lead: "Why small businesses and their accountants switch to UnReceipt",
    oldTitle: "The old way",
    old: [
      "Paper receipts lost in wallets and cars",
      "Email receipts buried across inboxes",
      "Typing amounts and VAT into spreadsheets",
      "Chasing colleagues for receipts at month-end",
    ],
    newTitle: "UnReceipt",
    new: [
      "Each receipt sent the moment you pay: photo, forward or straight from your inbox",
      "Merchant, amount and VAT read in seconds",
      "Missing receipts found from the bank statement, with a reminder every Monday",
      "Employees send their receipts to you for approval",
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
      "Photo, forwarding and connected Gmail or Outlook",
      "Receipts read in seconds, VAT included",
      "Your accountant connected at no extra cost",
      "Employees and approvals included",
      "Original + PDF for every confirmed receipt",
      "Cancel anytime",
    ],
    notePilot: "Free during the pilot. The prices above apply once the pilot ends. All prices excl. VAT; Swedish companies pay 25% moms on top, EU companies with a VAT number are reverse-charged.",
    notePaid: "First week free on every plan. All prices excl. VAT; Swedish companies pay 25% moms on top, EU companies with a VAT number are reverse-charged.",
  },
  about: {
    eyebrow: "Who it's for",
    title: "One App for the Business and Its Accountant",
    lead: "Our mission: no business owner, and no accountant, should ever have to chase a receipt.",
    more: "Learn more",
    items: [
      {
        title: "Small Businesses",
        desc: "Everyone snaps or forwards their own receipts. Employees send theirs to you for approval, you see who to pay back, and your accountant gets the approved ones.",
      },
      {
        title: "Freelancers & Sole Traders",
        desc: "Every receipt sorted with its VAT as it arrives, ready for your tax return or your accountant. One flat monthly price.",
      },
      {
        title: "Accounting Firms",
        desc: "Every client's receipts in one portal, checked against their bank statement, with a Monday reminder in your firm's name and an export for the books. Free for your firm.",
      },
    ],
  },
  faq: { eyebrow: "FAQ", title: "Questions, Answered" },
  badges: [
    "Data Stored in the EU",
    "Original File Kept",
    "iPhone App and Web",
    "Free for Accounting Firms",
  ],
  ending: {
    kind: "cta",
    badge: "Paper is Past",
    title: "Stop chasing receipts",
    leadPilot: "UnReceipt is free during the pilot. Built for Sweden and France, open to companies everywhere.",
    leadPaid: "First week free. Built for Sweden and France, open to companies everywhere.",
  },
};

const sv: LandingCopy = {
  nav: {
    backToTop: "UnReceipt — till toppen",
    how: "Så funkar det",
    pricing: "Priser",
    about: "För vem",
    faq: "Vanliga frågor",
    signIn: "Logga in",
    ctaPilot: "Gå med i piloten",
    ctaPaid: "Kom igång gratis",
    openMenu: "Öppna menyn",
    closeMenu: "Stäng menyn",
  },
  hero: {
    seoTitle: "Kvittohantering för småföretag och deras redovisningsbyråer",
    titleLine1: "Varje kvitto.",
    titleLine2: "Direkt hos",
    titleAccent: "din redovisare.",
    lead: "Fota kvittot, vidarebefordra det, eller koppla Gmail eller Outlook en gång. UnReceipt läser av varje kvitto på några sekunder, med momsen, och din redovisningskonsult ser det direkt — ingen jakt på kvitton vid månadsskiftet, på någon sida.",
    ctaPilot: "Gå med i piloten",
    ctaPaid: "Prova gratis i en vecka",
    secondary: "Se demon",
    notePilot: "Gratis under piloten. Därefter från {price}/mån.",
    notePaid: "Från {price}/mån exkl. moms efter gratisveckan. Avsluta när du vill.",
    notePilotNoPrice: "Gratis under piloten. Inget kort behövs.",
    notePaidNoPrice: "Första veckan gratis. Avsluta när du vill.",
  },
  phone: {
    verified: "Kontrollerat",
    latestMeta: "Måltider · Moms 12 % 36,64 kr",
    today: "Idag",
    todayCount: "3 kvitton",
    snap: "Fota ett kvitto",
    forwarded: "Vidarebefordrat",
  },
  samples: SWEDISH_SAMPLES,
  stats: [
    { value: "Sekunder", label: "från foto till ifyllt kvitto" },
    { value: "3", label: "vägar in: foto, vidarebefordrat mejl eller kopplad inkorg" },
    { value: "1", label: "ställe för dig, ditt team och din redovisningskonsult" },
    { value: "0", label: "bankinloggningar eller nya kort behövs" },
  ],
  ticker: {
    verified: "Kontrollerat",
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
    title: "Skicka en gång. Sedan är det klart.",
    items: [
      {
        title: "Alla vägar in",
        desc: "Fota papperskvitton i iPhone-appen eller i webbläsaren, vidarebefordra e-postkvitton till din egen UnReceipt-adress, eller koppla Gmail eller Outlook så kommer de in av sig själva. En hel hög? Ladda upp upp till 50 åt gången.",
      },
      {
        title: "Avläst på sekunder, med moms",
        desc: "Säljare, datum, kvittorader, momssats och momsbelopp läses av åt dig, och utländska kvitton får ett belopp i kronor efter ECB:s kurs. Det som är osäkert väntar på att du bekräftar med ett tryck.",
      },
      {
        title: "Redovisningskonsulten är redan med",
        desc: "Din redovisningskonsult ser kvittona när de kommer in, stämmer av dem mot kontoutdraget och exporterar dem till bokföringen. Inga ZIP-filer att skicka, ingen jakt vid månadsskiftet.",
      },
    ],
  },
  how: {
    eyebrow: "Så funkar det",
    title: "Tre steg. Fem minuter.",
    lead: "Ingen bankinloggning, inget nytt kort, inget att installera på datorn.",
    step: "STEG",
    items: [
      {
        title: "Koppla ihop dig med byrån",
        desc: "Bjud in din redovisningskonsult under Settings, eller öppna länken byrån skickar och tryck på Yes, share. Ingen redovisningskonsult? Hoppa över steget och exportera själv.",
      },
      {
        title: "Skicka kvittot när du betalar",
        desc: "Fota papperskvittona, vidarebefordra eller hämta in e-postkvittona automatiskt. Varje kvitto läses av på sekunder; de osäkra bekräftar du mot originalet.",
      },
      {
        title: "Klart att bokföra",
        desc: "Din redovisningskonsult ser varje kvitto, hittar betalningar på kontoutdraget som saknar kvitto och exporterar månaden med momsraderna.",
      },
    ],
  },
  difference: {
    eyebrow: "Skillnaden",
    title: "Papper bleknar. Enkelheten består.",
    lead: "Därför byter småföretag och deras redovisningsbyråer till UnReceipt",
    oldTitle: "Det gamla sättet",
    old: [
      "Papperskvitton som försvinner i plånböcker och bilar",
      "E-postkvitton begravda i olika inkorgar",
      "Belopp och moms som knappas in i kalkylark",
      "Jakt på kollegornas kvitton vid månadsskiftet",
    ],
    newTitle: "UnReceipt",
    new: [
      "Varje kvitto skickas när du betalar: foto, vidarebefordrat eller direkt från inkorgen",
      "Säljare, belopp och moms avlästa på sekunder",
      "Saknade kvitton hittas via kontoutdraget, med en påminnelse varje måndag",
      "Anställda skickar sina kvitton till dig för godkännande",
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
      "Foto, vidarebefordran och kopplad Gmail eller Outlook",
      "Kvitton avlästa på sekunder, med moms",
      "Din redovisningsbyrå kopplad utan extra kostnad",
      "Anställda och godkännanden ingår",
      "Original + PDF för varje bekräftat kvitto",
      "Avsluta när du vill",
    ],
    notePilot: "Gratis under piloten. Priserna ovan gäller när piloten är slut. Alla priser exkl. moms; svenska företag betalar 25 % moms ovanpå, EU-företag med momsregistreringsnummer faktureras med omvänd skattskyldighet.",
    notePaid: "Första veckan gratis på alla planer. Alla priser exkl. moms; svenska företag betalar 25 % moms ovanpå, EU-företag med momsregistreringsnummer faktureras med omvänd skattskyldighet.",
  },
  about: {
    eyebrow: "För vem",
    title: "En app för företaget och redovisningsbyrån",
    lead: "Vårt uppdrag: ingen företagare, och ingen redovisningskonsult, ska behöva jaga ett kvitto igen.",
    more: "Läs mer",
    items: [
      {
        title: "Småföretag",
        desc: "Alla fotar eller vidarebefordrar sina egna kvitton. Anställda skickar sina till dig för godkännande, du ser vem som ska få pengar tillbaka, och byrån får de godkända.",
      },
      {
        title: "Enskild firma och frilansare",
        desc: "Varje kvitto sorterat med momsen direkt när det kommer in, redo för deklarationen eller din redovisningskonsult. Ett fast månadspris.",
      },
      {
        title: "Redovisningsbyråer",
        desc: "Alla klienters kvitton i en portal, avstämda mot kontoutdraget, med en påminnelse varje måndag i byråns namn och en export till bokföringen. Gratis för byrån.",
      },
    ],
  },
  faq: { eyebrow: "Vanliga frågor", title: "Frågor och svar" },
  badges: [
    "Data lagras inom EU",
    "Originalfilen sparas",
    "iPhone-app och webb",
    "Gratis för redovisningsbyråer",
  ],
  ending: {
    kind: "cta",
    badge: "Paper is Past",
    title: "Sluta jaga kvitton",
    leadPilot: "UnReceipt är gratis medan piloten pågår. Byggt för Sverige och Frankrike, öppet för företag överallt.",
    leadPaid: "Prova gratis i en vecka. Avsluta när du vill.",
  },
};

const fr: LandingCopy = {
  nav: {
    backToTop: "UnReceipt — retour en haut",
    how: "Comment ça marche",
    pricing: "Tarifs",
    about: "Pour qui",
    faq: "FAQ",
    signIn: "Se connecter",
    ctaPilot: "Je participe",
    ctaPaid: "Essai gratuit",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
  },
  hero: {
    seoTitle: "Gestion des justificatifs pour TPE, indépendants et leurs experts-comptables",
    titleLine1: "Chaque reçu.",
    titleLine2: "Déjà chez",
    titleAccent: "votre comptable.",
    lead: "Photographiez un reçu, transférez-le, ou connectez Gmail ou Outlook une fois pour toutes. UnReceipt lit chaque reçu en quelques secondes, TVA comprise, et votre expert-comptable le voit tout de suite — fini les relances de fin de mois, d’un côté comme de l’autre.",
    ctaPilot: "Rejoindre la phase pilote",
    ctaPaid: "Essayer gratuitement une semaine",
    secondary: "Voir la démo",
    notePilot: "Gratuit pendant la phase pilote. Ensuite, à partir de {price}\u00a0HT par mois.",
    notePaid: "À partir de {price}\u00a0HT par mois après la semaine gratuite. Sans engagement.",
    notePilotNoPrice: "Gratuit pendant la phase pilote. Sans carte bancaire.",
    notePaidNoPrice: "Première semaine gratuite. Sans engagement.",
  },
  phone: {
    verified: "Vérifié",
    latestMeta: "Repas · TVA 10 % 1,68 €",
    today: "Aujourd’hui",
    todayCount: "3 reçus",
    snap: "Photographier un ticket",
    forwarded: "Transféré",
  },
  samples: FRENCH_SAMPLES,
  stats: [
    { value: "Secondes", label: "entre la photo et la fiche remplie" },
    { value: "3", label: "façons d’envoyer\u00a0: photo, e-mail transféré ou boîte connectée" },
    { value: "1", label: "seul endroit pour vous, votre équipe et votre expert-comptable" },
    { value: "0", label: "accès bancaire ou nouvelle carte nécessaire" },
  ],
  ticker: {
    verified: "Vérifié",
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
    title: "Envoyez-le une fois. C’est réglé.",
    items: [
      {
        title: "Toutes les façons d’envoyer",
        desc: "Photographiez vos tickets dans l’app iPhone ou le navigateur, transférez vos reçus par e-mail à votre adresse UnReceipt, ou connectez Gmail ou Outlook pour qu’ils arrivent tout seuls. Toute une pile\u00a0? Envoyez-en jusqu’à 50 d’un coup.",
      },
      {
        title: "Lu en quelques secondes, TVA comprise",
        desc: "Fournisseur, date, lignes, taux et montant de TVA sont lus pour vous, et les reçus en devises reçoivent un montant converti au taux de la BCE. Ce qui est incertain attend une simple confirmation.",
      },
      {
        title: "Votre expert-comptable, déjà dans la boucle",
        desc: "Votre expert-comptable voit vos reçus dès leur arrivée, les rapproche de votre relevé bancaire et les exporte pour la saisie. Plus de ZIP à envoyer, plus de relances en fin de mois.",
      },
    ],
  },
  how: {
    eyebrow: "Comment ça marche",
    title: "Trois étapes. Cinq minutes.",
    lead: "Pas d’accès bancaire, pas de nouvelle carte, rien à installer sur l’ordinateur.",
    step: "ÉTAPE",
    items: [
      {
        title: "Reliez-vous à votre expert-comptable",
        desc: "Invitez votre expert-comptable depuis les réglages, ou ouvrez le lien qu’il vous envoie et appuyez sur Yes, share. Pas d’expert-comptable\u00a0? Passez cette étape et exportez vous-même.",
      },
      {
        title: "Envoyez chaque reçu au moment de payer",
        desc: "Photographiez les tickets, transférez ou laissez arriver tout seuls les reçus par e-mail. Chacun est lu en quelques secondes\u00a0; vous confirmez les incertains face à l’original.",
      },
      {
        title: "Prêt pour la saisie",
        desc: "Votre expert-comptable voit chaque reçu, repère les paiements du relevé bancaire qui n’en ont pas encore, et exporte le mois avec ses lignes de TVA.",
      },
    ],
  },
  difference: {
    eyebrow: "La différence",
    title: "Le papier s’efface. La simplicité reste.",
    lead: "Pourquoi les petites entreprises et leurs experts-comptables passent à UnReceipt",
    oldTitle: "Avant",
    old: [
      "Des tickets perdus dans les portefeuilles et les voitures",
      "Des reçus par e-mail éparpillés dans plusieurs boîtes",
      "Des montants et de la TVA saisis à la main dans un tableur",
      "Des relances aux collègues en fin de mois",
    ],
    newTitle: "UnReceipt",
    new: [
      "Chaque reçu envoyé au moment de payer\u00a0: photo, transfert ou directement depuis la boîte mail",
      "Fournisseur, montant et TVA lus en quelques secondes",
      "Les reçus manquants repérés sur le relevé bancaire, avec un rappel chaque lundi",
      "Vos salariés vous envoient leurs reçus pour validation",
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
      "Photo, transfert et Gmail ou Outlook connecté",
      "Reçus lus en quelques secondes, TVA comprise",
      "Votre expert-comptable relié sans surcoût",
      "Salariés et validations inclus",
      "Reçu d’origine + PDF pour chaque reçu confirmé",
      "Sans engagement",
    ],
    notePilot: "Gratuit pendant la phase pilote. Les prix ci-dessus s’appliqueront à la fin du pilote. Tous les prix sont hors taxes\u00a0; la TVA applicable est calculée au paiement.",
    notePaid: "Première semaine gratuite sur toutes les formules. Tous les prix sont hors taxes\u00a0; la TVA applicable est calculée au paiement.",
  },
  about: {
    eyebrow: "Pour qui",
    title: "Une application pour l’entreprise et son expert-comptable",
    lead: "Notre mission\u00a0: qu’aucun dirigeant, ni aucun expert-comptable, n’ait plus jamais à courir après un reçu.",
    more: "En savoir plus",
    items: [
      {
        title: "TPE",
        desc: "Chacun photographie ou transfère ses propres reçus. Vos salariés vous envoient les leurs pour validation, vous voyez qui rembourser, et votre expert-comptable reçoit ceux que vous avez validés.",
      },
      {
        title: "Indépendants",
        desc: "Chaque reçu classé avec sa TVA dès son arrivée, prêt pour votre comptabilité ou votre expert-comptable. Un prix mensuel fixe.",
      },
      {
        title: "Experts-comptables",
        desc: "Les reçus de tous vos clients dans un seul portail, rapprochés de leur relevé bancaire, avec un rappel chaque lundi au nom du cabinet et un export pour la saisie. Gratuit pour le cabinet.",
      },
    ],
  },
  faq: { eyebrow: "FAQ", title: "Vos questions, nos réponses" },
  badges: [
    "Données hébergées dans l’UE",
    "Fichier d’origine conservé",
    "App iPhone et web",
    "Gratuit pour les cabinets",
  ],
  ending: {
    kind: "cta",
    badge: "Le papier, c’est du passé",
    title: "Fini la chasse aux reçus",
    leadPilot: "UnReceipt est gratuit pendant la phase pilote. Conçu pour la France et la Suède, ouvert aux entreprises de partout.",
    leadPaid: "Essayez gratuitement pendant une semaine. Sans engagement.",
  },
};

export const LANDING_COPY: Record<Locale, LandingCopy> = { en, sv, fr };

/** Fills `{name}` placeholders in a copy string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
