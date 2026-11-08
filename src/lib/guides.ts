import type { FaqItem } from "@/lib/faq";
import type { Locale } from "@/lib/locale";
import type { MarketingPageId } from "@/lib/marketing-pages";

/**
 * Guides: plain-language answers to the receipt questions people search
 * for, one country's law per page (Swedish law on /sv, French law on /fr,
 * both in short on the English page). Shared by the guide pages, their
 * Article/FAQ structured data and /llms.txt.
 *
 * Every legal statement carries its reference and a source in `sources`,
 * checked against riksdagen.se, bfn.se, skatteverket.se, legifrance.gouv.fr,
 * bofip.impots.gouv.fr and service-public.fr on 2026-11-08. Re-check them
 * and bump `updated` (and MARKETING_PAGES.lastModified) when a rule
 * changes. Known upcoming change: LPF L102 B goes from 6 to 10 years on
 * 2027-01-01 (loi 2026-534, art. 36); the French copy already says so.
 *
 * What UnReceipt does must match AGENTS.md: receipts stored in Frankfurt,
 * no certified copy (copie conforme) for France, 90 days to download after
 * cancelling.
 *
 * Pure data, safe to import from client components.
 */

export type GuidePageId = Extract<MarketingPageId, "guideRetention" | "guidePaper">;

export type GuideSection = { heading: string; body: string[]; list?: string[] };

export type Guide = {
  page: GuidePageId;
  locale: Locale;
  /** The H1. */
  title: string;
  /** The <title>; keyword first, under ~65 characters before " | UnReceipt". */
  metaTitle: string;
  description: string;
  breadcrumb: string;
  eyebrow: string;
  published: string;
  updated: string;
  answerLabel: string;
  answer: string;
  sections: GuideSection[];
  faqTitle: string;
  faq: FaqItem[];
  sourcesTitle: string;
  sources: { label: string; url: string }[];
  updatedLabel: string;
  disclaimer: string;
  cta: { title: string; lead: string; secondaryLabel: string };
  relatedTitle: string;
  related: { label: string; page: MarketingPageId }[];
};

const S = {
  bfl: {
    label: "Bokföringslag (1999:1078), riksdagen.se",
    url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/bokforingslag-19991078_sfs-1999-1078/",
  },
  bfn2024: {
    label: "BFN: Vad innebär den ändrade regeln om överföring av räkenskapsinformation?",
    url: "https://www.bfn.se/vad-innebar-den-andrade-regeln-om-overforing-av-rakenskapsinformation-i-bokforingslagen/",
  },
  sfs2024: {
    label: "SFS 2024:342, ändring i bokföringslagen",
    url: "https://svenskforfattningssamling.se/sites/default/files/sfs/2024-05/SFS2024-342.pdf",
  },
  skvAbroad: {
    label: "Skatteverket, rättslig vägledning: förvaring av räkenskapsinformation i annat land",
    url: "https://www4.skatteverket.se/rattsligvagledning/edition/2026.14/324690.html",
  },
  verksamt: { label: "verksamt.se: Bokföring", url: "https://verksamt.se/bokforing" },
  l123_22: {
    label: "Code de commerce, article L123-22 (Légifrance)",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219327",
  },
  l123_28: {
    label: "Code de commerce, article L123-28 (Légifrance)",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000019289307",
  },
  l102b: {
    label: "Livre des procédures fiscales, article L102 B (Légifrance)",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041471233/",
  },
  l102b2027: {
    label: "Article L102 B, version en vigueur au 1er janvier 2027 (Légifrance)",
    url: "https://www.legifrance.gouv.fr/codes/id/LEGIARTI000053189500/2027-01-01",
  },
  loi2026: {
    label: "Loi n° 2026-534 du 25 juin 2026, article 36 (Légifrance)",
    url: "https://www.legifrance.gouv.fr/loda/id/LEGIARTI000054312311/2026-06-27",
  },
  a102b2: {
    label: "Livre des procédures fiscales, article A102 B-2 (Légifrance)",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000034311685",
  },
  bofipScan: {
    label: "BOFiP, BOI-CF-COM-10-10-30-10 : factures numérisées",
    url: "https://bofip.impots.gouv.fr/bofip/8877-PGP.html/identifiant%3DBOI-CF-COM-10-10-30-10-20180720",
  },
  bofipResto: {
    label: "BOFiP, BOI-TVA-DECLA-30-20-20-20 : notes de restaurant",
    url: "https://bofip.impots.gouv.fr/bofip/142-PGP.html/identifiant%3DBOI-TVA-DECLA-30-20-20-20-20190925",
  },
  spTva: {
    label: "entreprendre.service-public.fr : récupération de la TVA",
    url: "https://entreprendre.service-public.fr/vosdroits/F23208",
  },
  spMicro: {
    label: "entreprendre.service-public.fr : obligations comptables du micro-entrepreneur",
    url: "https://entreprendre.service-public.fr/vosdroits/F23266",
  },
};

const PUBLISHED = "2026-11-08";
const UPDATED = "2026-11-08";

// ─── English: retention in Sweden and France ─────────────────────────

const retentionEn: Guide = {
  page: "guideRetention",
  locale: "en",
  title: "How long do you have to keep receipts? Sweden and France",
  metaTitle: "How Long to Keep Business Receipts in Sweden & France (2026) | UnReceipt",
  description:
    "Sweden: until the end of the seventh year after the financial year's calendar year. France: ten years. The exact rules, when paper can go, and where digital receipts may be stored.",
  breadcrumb: "How long to keep receipts",
  eyebrow: "Guide",
  published: PUBLISHED,
  updated: UPDATED,
  answerLabel: "Short answer",
  answer:
    "In Sweden, keep receipts until the end of the seventh year after the end of the calendar year in which the financial year ended (Bookkeeping Act, chapter 7, section 2): for a financial year ending 31 December 2026, that is until 31 December 2033. In France, keep them ten years from the close of the financial year (Commercial Code, article L123-22); the tax code's own period also becomes ten years on 1 January 2027.",
  sections: [
    {
      heading: "Sweden: the seven-year rule",
      body: [
        "The Swedish Bookkeeping Act (bokföringslagen, 1999:1078) says accounting records — receipts included — must be kept “until and including the seventh year after the end of the calendar year in which the financial year ended” (chapter 7, section 2). Skatteverket often shortens this to “at least seven years”, but the legal wording runs a little longer.",
        "Every business is covered, whatever its size: a natural person who runs a business is required to keep books for it (chapter 2, section 6). Sole traders (enskild firma) use the calendar year as their financial year, so receipts from 2026 are kept until the end of 2033.",
      ],
    },
    {
      heading: "Sweden: paper originals and digital copies",
      body: [
        "Since 1 July 2024 a paper receipt may be thrown away once it has been transferred to digital form, as long as the transfer — considering the technical methods, organisational measures and other circumstances — carries no risk that the information is changed or lost (chapter 7, section 6, as amended by SFS 2024:342). Before that, the paper had to be kept for about three more years. The seven years then apply to the digital copy.",
        "Records must as a rule be kept in Sweden. Electronic records may be kept in another EU country if three conditions are met (chapter 7, section 3 a):",
      ],
      list: [
        "the company notifies Skatteverket of where they are kept, and of every change — in writing, at the latest when storage abroad begins;",
        "Skatteverket and Tullverket can get immediate electronic access to them on request;",
        "they can be printed in Sweden right away.",
      ],
    },
    {
      heading: "France: ten years",
      body: [
        "The Commercial Code says accounting documents and supporting documents (pièces justificatives) are kept for ten years (article L123-22), counted from the close of the financial year. Micro-entrepreneurs keep their registers and supporting documents for ten years too (article L123-28).",
        "The tax code (Livre des procédures fiscales, article L102 B) currently asks for six years. Law no. 2026-534 of 25 June 2026 raises it to ten years for documents whose retention period ends after 1 January 2027 — so in practice, keep everything for ten years.",
        "A paper invoice may only be destroyed after scanning if the scan is a compliant copy under article A102 B-2: an identical reproduction with no image processing, kept as PDF with a server seal, digital fingerprint or electronic signature, and timestamped. Without that, keep the paper.",
      ],
    },
    {
      heading: "What this means if you use UnReceipt",
      body: [
        "UnReceipt keeps each receipt's original file — the photo or the email — together with a PDF, and stores them in the EU, in Frankfurt, Germany. A Swedish company that keeps its receipts in UnReceipt therefore notifies Skatteverket once that its records are stored in Germany. UnReceipt cannot do this for you: each company notifies for itself.",
        "The duty to keep receipts stays with your company. You can download a ZIP for any month, year or everything at any time, and after you cancel your receipts stay available for 90 days so you can move them to your own archive or your accountant. UnReceipt doesn't produce the certified copy French law asks for, so in France keep your paper originals.",
      ],
    },
  ],
  faqTitle: "Common questions",
  faq: [
    {
      q: "Do sole traders in Sweden have to keep receipts for seven years?",
      a: "Yes. Every natural person running a business is required to keep books, whatever its size, and the same retention period applies. A sole trader's financial year is the calendar year, so receipts from 2026 are kept until 31 December 2033.",
    },
    {
      q: "Can a Swedish company keep its receipts in a cloud service in another EU country?",
      a: "Yes, electronic records may be kept in another EU country if the company notifies Skatteverket in writing of where they are kept (at the latest when storage abroad begins), gives Skatteverket and Tullverket immediate electronic access on request, and can print them in Sweden right away (Bookkeeping Act, chapter 7, section 3 a).",
    },
    {
      q: "Can I throw away paper receipts after scanning them?",
      a: "In Sweden, yes since 1 July 2024, once the transfer carries no risk that the information is changed or lost. In France, a paper invoice may only be destroyed if the scan meets article A102 B-2 of the tax procedures code; otherwise keep the paper.",
    },
  ],
  sourcesTitle: "Sources",
  sources: [S.bfl, S.bfn2024, S.skvAbroad, S.l123_22, S.l123_28, S.l102b, S.loi2026, S.a102b2],
  updatedLabel: "Last reviewed",
  disclaimer:
    "This guide explains the rules in general terms and isn't legal or tax advice. For your own situation, ask your accountant.",
  cta: {
    title: "Keep every receipt in one place",
    lead: "Forward or snap your receipts; UnReceipt keeps the original and a PDF of each, ready for your accountant.",
    secondaryLabel: "See the demo",
  },
  relatedTitle: "Read next",
  related: [
    { label: "UnReceipt for freelancers and sole traders", page: "freelancers" },
    { label: "UnReceipt for accounting firms", page: "accountants" },
  ],
};

// ─── Swedish ─────────────────────────────────────────────────────────

const retentionSv: Guide = {
  page: "guideRetention",
  locale: "sv",
  title: "Hur länge ska man spara kvitton?",
  metaTitle: "Hur länge ska man spara kvitton? Reglerna 2026 | UnReceipt",
  description:
    "Kvitton ska sparas till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades. Så räknar du, vad som gäller för enskild firma och var digitala kvitton får förvaras.",
  breadcrumb: "Hur länge ska man spara kvitton?",
  eyebrow: "Guide",
  published: PUBLISHED,
  updated: UPDATED,
  answerLabel: "Kort svar",
  answer:
    "Kvitton och annan räkenskapsinformation ska sparas till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades (bokföringslagen 7 kap. 2 §). Slutar räkenskapsåret den 31 december 2026 ska kvittona alltså sparas till och med den 31 december 2033.",
  sections: [
    {
      heading: "Så räknar du ut bevarandetiden",
      body: [
        "Utgå från kalenderåret då räkenskapsåret slutar och lägg till sju hela år. Skatteverket skriver ofta “minst sju år”, men lagtexten ger i praktiken lite längre tid eftersom du räknar till och med utgången av det sjunde året.",
      ],
      list: [
        "Räkenskapsår 2026-01-01–2026-12-31: spara till och med 2033-12-31.",
        "Brutet räkenskapsår 2025-07-01–2026-06-30: räkenskapsåret slutar 2026, spara till och med 2033-12-31.",
        "Räkenskapsår 2025: spara till och med 2032-12-31.",
      ],
    },
    {
      heading: "Gäller det enskild firma också?",
      body: [
        "Ja. En fysisk person som bedriver näringsverksamhet är bokföringsskyldig för den (2 kap. 6 §), oavsett hur liten verksamheten är. En enskild firma har kalenderåret som räkenskapsår, så kvitton från 2026 sparas till och med 2033. Med en nettoomsättning på normalt högst 3 miljoner kronor får du förenkla, till exempel med kontantmetoden och förenklat årsbokslut, men bevarandetiden är densamma.",
      ],
    },
    {
      heading: "Vad ska sparas?",
      body: [
        "All räkenskapsinformation: kvitton, fakturor och andra verifikationer, men också till exempel kontoutdrag och avtal som behövs för att förstå bokföringen. En verifikation ska bland annat visa när affären gjordes, vad den avser, beloppet och vem motparten är (5 kap. 7 §).",
      ],
    },
    {
      heading: "Digitala kvitton och papperskvitton",
      body: [
        "Sedan den 1 juli 2024 får du slänga papperskvittot när det har förts över till digital form, så länge överföringen inte innebär någon risk för att uppgifterna ändras eller försvinner (7 kap. 6 §). Bevarandetiden gäller då den digitala kopian.",
        "Räkenskapsinformationen ska som huvudregel förvaras i Sverige. Digital räkenskapsinformation får förvaras i ett annat EU-land om företaget anmäler förvaringsplatsen till Skatteverket — skriftligt och senast när förvaringen utomlands börjar — ger Skatteverket och Tullverket omedelbar elektronisk åtkomst på begäran och kan skriva ut informationen i Sverige direkt (7 kap. 3 a §).",
      ],
    },
    {
      heading: "Så gör du med UnReceipt",
      body: [
        "UnReceipt sparar varje kvittos originalfil — fotot eller mejlet — och en PDF, och lagrar dem inom EU, i Frankfurt i Tyskland. Använder ditt företag UnReceipt anmäler du därför en gång skriftligt till Skatteverket att räkenskapsinformationen förvaras i Tyskland. Det kan vi inte göra åt dig: varje företag anmäler själv.",
        "Skyldigheten att spara kvittona ligger hos företaget. Du kan när som helst ladda ner en ZIP per månad, år eller allt, och om du avslutar finns kvittona kvar i 90 dagar så att du kan flytta dem till ditt eget arkiv eller din redovisningskonsult.",
      ],
    },
  ],
  faqTitle: "Vanliga frågor",
  faq: [
    {
      q: "Räcker det att spara kvitton i sju år?",
      a: "Inte riktigt. Lagen säger till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades. Kvitton från ett räkenskapsår som slutar 31 december 2026 sparas till och med 31 december 2033, alltså sju hela år efter räkenskapsårets slut.",
    },
    {
      q: "Får man spara kvitton i molnet?",
      a: "Ja. Digital räkenskapsinformation får förvaras i ett annat EU-land om du skriftligt anmäler förvaringsplatsen till Skatteverket senast när förvaringen börjar, ger Skatteverket och Tullverket omedelbar elektronisk åtkomst och kan skriva ut informationen i Sverige direkt (bokföringslagen 7 kap. 3 a §).",
    },
    {
      q: "Vad händer om jag inte sparar kvittona?",
      a: "Då uppfyller du inte bokföringslagens krav, och vid en granskning kan du sakna underlag för dina avdrag och din momsredovisning. Allvarliga brister kan i värsta fall bedömas som bokföringsbrott.",
    },
  ],
  sourcesTitle: "Källor",
  sources: [S.bfl, S.sfs2024, S.bfn2024, S.skvAbroad, S.verksamt],
  updatedLabel: "Senast granskad",
  disclaimer:
    "Guiden förklarar reglerna översiktligt och är inte juridisk rådgivning. Fråga din redovisningskonsult om din egen situation.",
  cta: {
    title: "Samla alla kvitton på ett ställe",
    lead: "Fota eller vidarebefordra kvittona; UnReceipt sparar original och PDF för varje kvitto, redo för bokföringen.",
    secondaryLabel: "Se demon",
  },
  relatedTitle: "Läs mer",
  related: [
    { label: "Får man slänga papperskvitton?", page: "guidePaper" },
    { label: "UnReceipt för enskild firma", page: "freelancers" },
    { label: "UnReceipt för redovisningsbyråer", page: "accountants" },
  ],
};

const paperSv: Guide = {
  page: "guidePaper",
  locale: "sv",
  title: "Får man slänga papperskvitton efter att ha fotat dem?",
  metaTitle: "Får man slänga papperskvitton? Så gäller reglerna sedan 2024 | UnReceipt",
  description:
    "Ja, sedan 1 juli 2024 får papperskvittot slängas när det förts över till digital form utan risk att uppgifterna ändras eller försvinner. Villkoren, en checklista och vad som gäller för lagring i molnet.",
  breadcrumb: "Får man slänga papperskvitton?",
  eyebrow: "Guide",
  published: PUBLISHED,
  updated: UPDATED,
  answerLabel: "Kort svar",
  answer:
    "Ja. Sedan den 1 juli 2024 får du slänga papperskvittot när det har förts över till digital form, så länge överföringen inte innebär någon risk för att uppgifterna ändras eller försvinner (bokföringslagen 7 kap. 6 §). Den digitala kopian ska sedan sparas lika länge som papperet skulle ha sparats.",
  sections: [
    {
      heading: "Vad ändrades 2024?",
      body: [
        "Före den 1 juli 2024 fick ett papperskvitto som förts över till digital form tidigast förstöras från och med det fjärde året efter utgången av det kalenderår då räkenskapsåret avslutades — du fick alltså spara både papper och kopia i ungefär tre år. Ändringen (SFS 2024:342) tog bort den väntetiden.",
        "Enligt Bokföringsnämnden gäller den nya regeln även kvitton som fördes över före den 1 juli 2024, om överföringen uppfyllde kravet.",
      ],
    },
    {
      heading: "Villkoret: ingen risk att uppgifterna ändras eller försvinner",
      body: [
        "Lagen bedömer överföringen med hänsyn till tekniska metoder, organisatoriska åtgärder och övriga omständigheter. I praktiken betyder det att den digitala kopian ska visa allt som papperet visade, och att den förvaras så att den inte kan ändras eller tappas bort.",
      ],
      list: [
        "Bilden är skarp och hela kvittot syns, med datum, säljare, belopp och moms läsbara.",
        "Kontrollera bilden innan du slänger papperet — inte efteråt.",
        "Förvara kopian på ett ställe med säkerhetskopiering, inte bara i mobilens kamerarulle.",
        "Ha en rutin: samma sätt varje gång, så att den som granskar kan förstå hur det gick till.",
      ],
    },
    {
      heading: "Glöm inte bevarandetiden och förvaringsplatsen",
      body: [
        "Den digitala kopian ska sparas till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades (7 kap. 2 §).",
        "Förvaras kopiorna i ett annat EU-land, till exempel hos en molntjänst, ska företaget skriftligt anmäla förvaringsplatsen till Skatteverket senast när förvaringen börjar, ge Skatteverket och Tullverket omedelbar elektronisk åtkomst och kunna skriva ut informationen i Sverige direkt (7 kap. 3 a §).",
      ],
    },
    {
      heading: "Med UnReceipt",
      body: [
        "Fota kvittot i appen, kontrollera att bilden är skarp och att hela kvittot syns, och spara. UnReceipt sparar bilden och en PDF för varje kvitto och lagrar dem inom EU, i Frankfurt i Tyskland, så du anmäler en gång skriftligt till Skatteverket att räkenskapsinformationen förvaras där. Avslutar du tjänsten laddar du ner dina kvitton — de finns kvar i 90 dagar.",
      ],
    },
  ],
  faqTitle: "Vanliga frågor",
  faq: [
    {
      q: "Gäller det även kvitton för representation och resor?",
      a: "Ja. Regeln gäller all räkenskapsinformation som förts över från papper till digital form, oavsett vad kvittot avser. Det som avgör är att överföringen inte innebär risk för att uppgifterna ändras eller försvinner.",
    },
    {
      q: "Måste jag anmäla till Skatteverket?",
      a: "Bara om den digitala räkenskapsinformationen förvaras i ett annat land än Sverige. Då ska företaget skriftligt anmäla var den förvaras, senast när förvaringen utomlands börjar, och anmäla varje ändring. Varje företag anmäler själv; en tjänsteleverantör kan inte göra det åt dig.",
    },
    {
      q: "Räcker ett foto i mobilen?",
      a: "Ett foto kan räcka för själva överföringen om det visar hela kvittot läsbart, men kopian ska också förvaras så att den inte kan ändras eller försvinna under hela bevarandetiden. En kamerarulle utan säkerhetskopia uppfyller knappast det.",
    },
  ],
  sourcesTitle: "Källor",
  sources: [S.bfl, S.sfs2024, S.bfn2024, S.skvAbroad],
  updatedLabel: "Senast granskad",
  disclaimer:
    "Guiden förklarar reglerna översiktligt och är inte juridisk rådgivning. Fråga din redovisningskonsult om din egen situation.",
  cta: {
    title: "Fota kvittot, släng papperet",
    lead: "UnReceipt läser av kvittot, sparar bilden och en PDF och kontrollerar varje kvitto inom 24 timmar.",
    secondaryLabel: "Se demon",
  },
  relatedTitle: "Läs mer",
  related: [
    { label: "Hur länge ska man spara kvitton?", page: "guideRetention" },
    { label: "UnReceipt för enskild firma", page: "freelancers" },
    { label: "UnReceipt för redovisningsbyråer", page: "accountants" },
  ],
};

// ─── French ──────────────────────────────────────────────────────────

const retentionFr: Guide = {
  page: "guideRetention",
  locale: "fr",
  title: "Combien de temps conserver les justificatifs comptables ?",
  metaTitle: "Durée de conservation des justificatifs : 10 ans (2026-2027) | UnReceipt",
  description:
    "Dix ans pour les pièces comptables (Code de commerce L123-22), et dix ans aussi pour le fisc à partir du 1er janvier 2027. Le point de départ, les micro-entrepreneurs et la numérisation.",
  breadcrumb: "Durée de conservation des justificatifs",
  eyebrow: "Guide",
  published: PUBLISHED,
  updated: UPDATED,
  answerLabel: "En bref",
  answer:
    "Conservez vos justificatifs dix ans à compter de la clôture de l’exercice : c’est la règle du Code de commerce (article L123-22). Le délai fiscal du Livre des procédures fiscales, de six ans aujourd’hui, passe lui aussi à dix ans pour les documents dont la conservation expire après le 1er janvier 2027.",
  sections: [
    {
      heading: "Dix ans pour la comptabilité",
      body: [
        "L’article L123-22 du Code de commerce dispose que « les documents comptables et les pièces justificatives sont conservés pendant dix ans ». Le délai court à partir de la clôture de l’exercice : pour un exercice clos le 31 décembre 2026, les justificatifs sont conservés jusqu’au 31 décembre 2036.",
      ],
    },
    {
      heading: "Six ans pour le fisc… puis dix ans à partir de 2027",
      body: [
        "L’article L102 B du Livre des procédures fiscales impose aujourd’hui six ans, à compter de la dernière opération inscrite ou de la date d’établissement du document. La loi n° 2026-534 du 25 juin 2026 (article 36) porte ce délai à dix ans pour les documents et pièces dont le délai de conservation expire après le 1er janvier 2027.",
        "Conséquence pratique : tout ce qui est encore dans le délai de six ans au 1er janvier 2027 doit désormais être gardé dix ans. Le plus simple est donc de tout conserver dix ans.",
      ],
    },
    {
      heading: "Micro-entrepreneurs et indépendants",
      body: [
        "Le micro-entrepreneur tient un livre des recettes et, s’il vend des marchandises, des denrées à consommer sur place ou à emporter, ou fournit un logement, un registre des achats. Il conserve ces registres et ses pièces justificatives pendant dix ans à compter de la clôture de l’exercice (article L123-28 du Code de commerce).",
      ],
    },
    {
      heading: "Et la version numérique ?",
      body: [
        "Une facture papier ne peut être détruite après numérisation que si la copie est conforme à l’original en image et en contenu, selon l’article A102 B-2 du Livre des procédures fiscales : reproduction à l’identique sans traitement de l’image, PDF muni d’un cachet serveur, d’une empreinte numérique ou d’une signature électronique, et horodatage. Pour les autres justificatifs, comme les tickets de caisse, la prudence est la même : gardez l’original papier.",
        "UnReceipt ne produit pas ce type de copie : utilisez-le pour lire, classer et transmettre vos justificatifs, et conservez vos originaux papier. Les reçus reçus par e-mail sont gardés tels qu’ils sont arrivés, avec un PDF, et hébergés dans l’UE, à Francfort.",
      ],
    },
  ],
  faqTitle: "Questions fréquentes",
  faq: [
    {
      q: "À partir de quand court le délai de dix ans ?",
      a: "À partir de la clôture de l’exercice. Pour un exercice clos le 31 décembre 2026, les pièces justificatives sont conservées jusqu’au 31 décembre 2036.",
    },
    {
      q: "Le délai fiscal est-il de six ou de dix ans ?",
      a: "Six ans aujourd’hui (article L102 B du Livre des procédures fiscales), dix ans pour les documents dont le délai de conservation expire après le 1er janvier 2027 (loi n° 2026-534 du 25 juin 2026, article 36). Comme le Code de commerce impose déjà dix ans, conservez tout dix ans.",
    },
    {
      q: "Peut-on conserver ses justificatifs uniquement en version numérique ?",
      a: "Pour une facture papier, seulement si la copie respecte l’article A102 B-2 du Livre des procédures fiscales (copie conforme, PDF scellé ou signé, horodaté). Sinon, gardez l’original papier.",
    },
  ],
  sourcesTitle: "Sources",
  sources: [S.l123_22, S.l102b, S.l102b2027, S.loi2026, S.l123_28, S.spMicro, S.a102b2],
  updatedLabel: "Dernière vérification",
  disclaimer:
    "Ce guide présente les règles de façon générale et ne constitue pas un conseil juridique ou fiscal. Pour votre situation, demandez à votre expert-comptable.",
  cta: {
    title: "Tous vos justificatifs au même endroit",
    lead: "Photographiez ou transférez vos reçus : UnReceipt les lit, les classe et garde l’original avec un PDF.",
    secondaryLabel: "Voir la démo",
  },
  relatedTitle: "À lire aussi",
  related: [
    { label: "Peut-on jeter les tickets de caisse après numérisation ?", page: "guidePaper" },
    { label: "UnReceipt pour les indépendants", page: "freelancers" },
    { label: "UnReceipt pour les experts-comptables", page: "accountants" },
  ],
};

const paperFr: Guide = {
  page: "guidePaper",
  locale: "fr",
  title: "Peut-on jeter les tickets de caisse après les avoir numérisés ?",
  metaTitle: "Jeter ses tickets de caisse après numérisation ? Les règles | UnReceipt",
  description:
    "En principe non : une facture papier ne peut être détruite que si sa copie est conforme à l’article A102 B-2. Ce qu’exige la copie, et pourquoi un ticket de caisse ne suffit pas pour récupérer la TVA.",
  breadcrumb: "Jeter les tickets de caisse",
  eyebrow: "Guide",
  published: PUBLISHED,
  updated: UPDATED,
  answerLabel: "En bref",
  answer:
    "En principe, non. Une facture papier ne peut être détruite après numérisation que si la copie est conforme à l’original en image et en contenu, au sens de l’article A102 B-2 du Livre des procédures fiscales (PDF scellé ou signé, horodaté, sans retouche). Une simple photo ne remplit pas ces conditions : gardez l’original.",
  sections: [
    {
      heading: "Ce qu’exige l’article A102 B-2",
      body: [
        "L’arrêté du 22 mars 2017 fixe les conditions dans lesquelles une facture établie sur papier peut être conservée sous forme numérique :",
      ],
      list: [
        "une reproduction à l’identique de l’image et du contenu : couleurs reproduites, aucun traitement de l’image, compression sans perte seulement ;",
        "une organisation documentée, avec des contrôles internes, qui garantit que les copies restent disponibles, lisibles et intactes pendant toute la durée de conservation ;",
        "chaque fichier conservé au format PDF ou PDF/A-3, avec un cachet serveur, une empreinte numérique ou une signature électronique ;",
        "un horodatage de chaque fichier.",
      ],
    },
    {
      heading: "Et les tickets de caisse ?",
      body: [
        "L’article A102 B-2 vise les factures. Pour les autres justificatifs, comme les tickets de caisse, la prudence est la même : tant que votre copie ne répond pas à ces exigences, conservez l’original papier.",
        "Pour récupérer la TVA, il faut en principe une facture au nom de l’entreprise : l’administration indique qu’un ticket de caisse remis à un salarié n’est pas une pièce suffisante pour déduire la TVA. Pour les notes de restaurant de 150 € HT ou moins, une tolérance permet au client d’inscrire lui-même son nom et son adresse dans l’espace prévu, si la note indique le montant HT, le taux et le montant de TVA et le montant TTC.",
      ],
    },
    {
      heading: "Ce qui change en 2027",
      body: [
        "À partir du 1er janvier 2027, le délai fiscal de conservation passe de six à dix ans (loi n° 2026-534, article 36), et un nouvel article L102 B bis exige l’authenticité de l’origine, l’intégrité du contenu et la lisibilité des factures pendant toute la durée de conservation.",
      ],
    },
    {
      heading: "Avec UnReceipt",
      body: [
        "UnReceipt ne produit pas de copie conforme au sens de l’article A102 B-2. Utilisez-le pour lire, classer et transmettre vos reçus à votre expert-comptable, et conservez vos tickets et factures papier dix ans. Les reçus qui arrivent par e-mail sont gardés tels qu’ils sont arrivés, avec un PDF, et hébergés dans l’UE, à Francfort.",
      ],
    },
  ],
  faqTitle: "Questions fréquentes",
  faq: [
    {
      q: "Une photo prise avec mon téléphone suffit-elle ?",
      a: "Non, pas pour détruire une facture papier. La copie doit respecter l’article A102 B-2 du Livre des procédures fiscales : reproduction à l’identique sans traitement de l’image, PDF avec cachet serveur, empreinte numérique ou signature électronique, et horodatage.",
    },
    {
      q: "Un ticket de caisse permet-il de récupérer la TVA ?",
      a: "En principe non : il faut une facture au nom de l’entreprise. Pour les notes de restaurant de 150 € HT ou moins, une tolérance permet au client d’y inscrire son identification, si la note détaille HT, taux et montant de TVA et TTC.",
    },
    {
      q: "Combien de temps garder les tickets papier ?",
      a: "Dix ans à compter de la clôture de l’exercice (article L123-22 du Code de commerce).",
    },
  ],
  sourcesTitle: "Sources",
  sources: [S.a102b2, S.bofipScan, S.spTva, S.bofipResto, S.l102b2027, S.loi2026, S.l123_22],
  updatedLabel: "Dernière vérification",
  disclaimer:
    "Ce guide présente les règles de façon générale et ne constitue pas un conseil juridique ou fiscal. Pour votre situation, demandez à votre expert-comptable.",
  cta: {
    title: "Retrouvez chaque ticket en un instant",
    lead: "Photographiez vos tickets : UnReceipt relève le fournisseur, le montant et la TVA, et les transmet à votre expert-comptable.",
    secondaryLabel: "Voir la démo",
  },
  relatedTitle: "À lire aussi",
  related: [
    { label: "Combien de temps conserver les justificatifs ?", page: "guideRetention" },
    { label: "UnReceipt pour les indépendants", page: "freelancers" },
    { label: "UnReceipt pour les experts-comptables", page: "accountants" },
  ],
};

export const GUIDES: readonly Guide[] = [retentionEn, retentionSv, paperSv, retentionFr, paperFr];

export function getGuide(page: GuidePageId, locale: Locale): Guide {
  const guide = GUIDES.find((g) => g.page === page && g.locale === locale);
  if (!guide) throw new Error(`No ${locale} guide for ${page}`);
  return guide;
}
