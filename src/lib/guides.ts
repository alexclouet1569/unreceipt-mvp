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
 * bofip.impots.gouv.fr and service-public.fr on 2026-11-08 (the outlays
 * guide, "Utlägg för anställda", against riksdagen.se, bfn.se,
 * skatteverket.se and verksamt.se on 2026-11-17). Re-check them
 * and bump `updated` (and MARKETING_PAGES.lastModified) when a rule
 * changes. Known upcoming change: LPF L102 B goes from 6 to 10 years on
 * 2027-01-01 (loi 2026-534, art. 36); the French copy already says so.
 * Also: Skatteverket's e-service "Momsåterbetalning inom EU" closes
 * temporarily on 2026-12-31 (the outlays guide says so); re-check it in
 * January 2027 and update the guide.
 *
 * What UnReceipt does must match AGENTS.md: receipts stored in Frankfurt,
 * no certified copy (copie conforme) for France, 90 days to download after
 * cancelling, and for the outlays guide the "Company team and approvals"
 * section, its limits included (no payout or payroll file; an employee's
 * receipts go when they delete their account).
 *
 * Pure data, safe to import from client components.
 */

export type GuidePageId = Extract<MarketingPageId, "guideRetention" | "guidePaper" | "guideOutlays">;

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
  /** `secondaryLabel`: the button to the demo request page (the other is the sign-up). */
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
  bfnEmployees: {
    label: "BFN brevsvar 2017-03-20: Fråga om verifikation när anställda betalar",
    url: "https://www.bfn.se/wp-content/uploads/2020/06/brevsvar-verifikationer-nar-anstallda-betalar.pdf",
  },
  bfnArchiveFaq: {
    label: "BFN: Frågor och svar om arkivering (anställdas utlägg)",
    url: "https://www.bfn.se/fragor-och-svar/arkivering/",
  },
  verksamtVer: {
    label: "verksamt.se: Verifikationer och verifikationens innehåll",
    url: "https://verksamt.se/bokforing/verifikationer",
  },
  ml: {
    label: "Mervärdesskattelag (2023:200), riksdagen.se",
    url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/mervardesskattelag-2023200_sfs-2023-200/",
  },
  skvOutlayVsAllowance: {
    label: "Skatteverket, rättslig vägledning: gränsdragning kostnadsersättning – utlägg",
    url: "https://www4.skatteverket.se/rattsligvagledning/edition/2026.14/1320.html",
  },
  skvAllowancePrivate: {
    label: "Skatteverket: Kostnadsersättning – utgifter i tjänsten",
    url: "https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/kostnadsersattning.4.18e1b10334ebe8bc80005623.html",
  },
  skvVatProof: {
    label: "Skatteverket, rättslig vägledning: Hur avdraget ska styrkas (anställdas utlägg)",
    url: "https://www4.skatteverket.se/rattsligvagledning/edition/2026.14/409813.html",
  },
  skvInvoice: {
    label: "Skatteverket, rättslig vägledning: Innehållet i en faktura (förenklad faktura)",
    url: "https://www4.skatteverket.se/rattsligvagledning/edition/2026.14/394342.html",
  },
  skvRepresentation: {
    label: "Skatteverket: Avdrag för moms vid representation",
    url: "https://www.skatteverket.se/foretag/moms/kopavarorochtjanster/avdragformomsvidrepresentation.4.15532c7b1442f256baec84b.html",
  },
  skvForeignVat: {
    label: "Skatteverket: Återbetalning av utländsk moms",
    url: "https://www.skatteverket.se/foretag/moms/sarskildamomsregler/handelmedandralander/aterbetalningavutlandskmoms.4.58d555751259e4d661680001107.html",
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
        "the company notifies Skatteverket of where they are kept, and of every change (Skatteverket advises doing so in writing, at the latest when storage abroad begins);",
        "Skatteverket and Tullverket can get immediate electronic access to them on request;",
        "they can be printed in Sweden right away.",
      ],
    },
    {
      heading: "France: ten years",
      body: [
        "The Commercial Code says traders' and companies' accounting documents and supporting documents (pièces justificatives) are kept for ten years (article L123-22), in practice counted from the close of the financial year. Micro-entrepreneurs and other self-employed people are also bound by the tax period below.",
        "The tax code (Livre des procédures fiscales, article L102 B) currently asks for six years. Law no. 2026-534 of 25 June 2026 raises it to ten years for documents whose retention period ends after 1 January 2027 — so in practice, keep everything for ten years.",
        "A paper invoice may only be destroyed after scanning if the scan is a compliant copy under article A102 B-2: an identical reproduction with no image processing, kept as PDF with a server seal, digital fingerprint or electronic signature, and timestamped. Without that, keep the paper.",
      ],
    },
    {
      heading: "What this means if you use UnReceipt",
      body: [
        "UnReceipt keeps each receipt's photo as uploaded (large photos are reduced on the phone) or its email as received, and a PDF once the receipt is checked, and stores them in the EU, in Frankfurt, Germany. A Swedish company that keeps its receipts in UnReceipt therefore notifies Skatteverket that its records are stored in Germany, and again if that changes. UnReceipt cannot do this for you: each company notifies for itself.",
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
      a: "Yes, electronic records may be kept in another EU country if the company notifies Skatteverket of where they are kept (Skatteverket advises in writing, at the latest when storage abroad begins), gives Skatteverket and Tullverket immediate electronic access on request, and can print them in Sweden right away (Bookkeeping Act, chapter 7, section 3 a).",
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
    lead: "Forward or snap your receipts; UnReceipt keeps each one with a PDF once checked, ready for your accountant.",
    secondaryLabel: "Book a demo",
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
        "Räkenskapsinformationen ska som huvudregel förvaras i Sverige. Digital räkenskapsinformation får förvaras i ett annat EU-land om företaget anmäler förvaringsplatsen och varje ändring till Skatteverket (Skatteverket rekommenderar skriftligt, senast när förvaringen utomlands börjar), ger Skatteverket och Tullverket omedelbar elektronisk åtkomst på begäran och kan skriva ut informationen i Sverige direkt (7 kap. 3 a §).",
      ],
    },
    {
      heading: "Så gör du med UnReceipt",
      body: [
        "UnReceipt sparar fotot som det laddades upp (stora foton förminskas i mobilen) eller mejlet som det kom, och en PDF när kvittot är kontrollerat, och lagrar dem inom EU, i Frankfurt i Tyskland. Använder ditt företag UnReceipt anmäler du därför till Skatteverket att räkenskapsinformationen förvaras i Tyskland, och igen om platsen ändras. Det kan vi inte göra åt dig: varje företag anmäler själv.",
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
      a: "Ja. Digital räkenskapsinformation får förvaras i ett annat EU-land om du anmäler förvaringsplatsen till Skatteverket (helst skriftligt, senast när förvaringen börjar), ger Skatteverket och Tullverket omedelbar elektronisk åtkomst och kan skriva ut informationen i Sverige direkt (bokföringslagen 7 kap. 3 a §).",
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
    lead: "Fota eller vidarebefordra kvittona; UnReceipt sparar varje kvitto med en PDF när det är kontrollerat, redo för bokföringen.",
    secondaryLabel: "Boka en demo",
  },
  relatedTitle: "Läs mer",
  related: [
    { label: "Får man slänga papperskvitton?", page: "guidePaper" },
    { label: "Utlägg för anställda: så hanterar du dem", page: "guideOutlays" },
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
        "Förvaras kopiorna i ett annat EU-land, till exempel hos en molntjänst, ska företaget anmäla förvaringsplatsen och varje ändring till Skatteverket (Skatteverket rekommenderar skriftligt, senast när förvaringen börjar), ge Skatteverket och Tullverket omedelbar elektronisk åtkomst och kunna skriva ut informationen i Sverige direkt (7 kap. 3 a §).",
      ],
    },
    {
      heading: "Med UnReceipt",
      body: [
        "Fota kvittot i appen och spara. Öppna sedan kvittot i UnReceipt och kontrollera att bilden är skarp och att hela kvittot syns — det är den sparade bilden som ska vara läsbar, och stora foton förminskas i mobilen innan de laddas upp. Först då slänger du papperet. UnReceipt lagrar kvittona inom EU, i Frankfurt i Tyskland, så du anmäler till Skatteverket att räkenskapsinformationen förvaras där, och igen om platsen ändras. Kopian ska finnas kvar hela bevarandetiden, även om du slutar använda tjänsten: ladda då ner dina kvitton — de finns kvar i 90 dagar efter att du avslutat.",
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
      a: "Ja, om den digitala räkenskapsinformationen förvaras i ett annat EU-land. Då ska företaget anmäla var den förvaras och varje ändring; Skatteverket rekommenderar att det görs skriftligt, senast när förvaringen utomlands börjar. Varje företag anmäler själv; en tjänsteleverantör kan inte göra det åt dig. Utanför EU krävs i regel tillstånd från Skatteverket.",
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
    title: "Fota kvittot – släng papperet när bilden är kontrollerad",
    lead: "AI läser av kvittot på några sekunder och UnReceipt sparar bilden. Kontrollera att den är skarp innan du slänger papperet.",
    secondaryLabel: "Boka en demo",
  },
  relatedTitle: "Läs mer",
  related: [
    { label: "Hur länge ska man spara kvitton?", page: "guideRetention" },
    { label: "Utlägg för anställda: så hanterar du dem", page: "guideOutlays" },
    { label: "UnReceipt för enskild firma", page: "freelancers" },
    { label: "UnReceipt för redovisningsbyråer", page: "accountants" },
  ],
};

// Outlays: written for owners of Swedish companies with employees. Every
// rule below was read on 2026-11-17 in the sources listed in `sources`.
const outlaysSv: Guide = {
  page: "guideOutlays",
  locale: "sv",
  title: "Utlägg för anställda: så hanterar du dem",
  metaTitle: "Utlägg för anställda: kvitto, moms och återbetalning | UnReceipt",
  description:
    "Utlägg för anställda i småföretag: vilket kvitto företaget behöver, hur utlägget betalas tillbaka, när momsen får dras av och vad du gör om kvittot har kommit bort.",
  breadcrumb: "Utlägg för anställda",
  eyebrow: "Guide",
  published: "2026-11-17",
  updated: "2026-11-17",
  answerLabel: "Kort svar",
  answer:
    "Ett utlägg är när en anställd betalar något åt företaget med egna pengar. Kvittot är företagets verifikation, utlägget bokförs som företagets kostnad och den anställde får tillbaka beloppet utan skatteavdrag och utan arbetsgivaravgifter. Momsen får dras av om företaget har avdragsrätt för inköpet (för till exempel representation är avdraget begränsat) och kvittot uppfyller momslagens krav, till exempel en förenklad faktura när beloppet är högst 4 000 kronor inklusive moms.",
  sections: [
    {
      heading: "Vad är ett utlägg?",
      body: [
        "När en anställd köper något åt företaget, till exempel material, en tågbiljett till ett kundmöte eller en programvara, och betalar med egna pengar eller ett eget kort, är det ett utlägg. Köpet är företagets: enligt Bokföringsnämnden (BFN) är det en affärshändelse i företaget redan när den anställde betalar, oavsett om betalningen skett med företagets kort eller den anställdes egna pengar.",
        "Ett utlägg är inte samma sak som en kostnadsersättning. En kostnadsersättning, till exempel traktamente, ska täcka den anställdes egna utgifter i arbetet och följer andra regler för skatt, arbetsgivaravgifter och moms. Vid ett utlägg är det i stället företaget som har köpt varan eller tjänsten, och utlägget bokförs direkt som företagets kostnad (Skatteverket).",
      ],
    },
    {
      heading: "Vilket underlag behöver företaget?",
      body: [
        "För varje affärshändelse ska det finnas en verifikation (bokföringslagen 5 kap. 6 §). Vid ett utlägg är det kvittot eller fakturan som den anställde fick vid köpet som är verifikationen i företagets bokföring (Skatteverket). Verifikationen ska enligt 5 kap. 7 § visa:",
      ],
      list: [
        "när den har sammanställts och när köpet gjordes;",
        "vad köpet avser och vilket belopp det gäller;",
        "vem motparten är, alltså säljaren;",
        "i förekommande fall vilka handlingar köpet bygger på och var de finns;",
        "ett verifikationsnummer eller annat identifieringstecken, som ni sätter när ni bokför.",
      ],
    },
    {
      heading: "Spara kvittot i den form det kom",
      body: [
        "Kvittot som den anställde fick är företagets räkenskapsinformation och ska sparas i det skick det hade när den anställde tog emot det (BFN). Ett digitalt kvitto, till exempel en pdf eller ett mejl, sparas i det format det kom i. Ett papperskvitto får sedan den 1 juli 2024 slängas när det har förts över till digital form, om överföringen inte innebär någon risk för att uppgifterna ändras eller försvinner (bokföringslagen 7 kap. 6 §).",
        "En enkel rutin: be de anställda lämna in kvittot samma vecka och skriva vad köpet gällde om det inte syns på kvittot, till exempel vilket projekt eller vilken kund.",
      ],
    },
    {
      heading: "Så betalar ni tillbaka utlägget",
      body: [
        "Företaget betalar tillbaka det belopp som den anställde har betalat. Ersättningen för ett utlägg är inte lön: arbetsgivaren gör inget skatteavdrag och betalar inga arbetsgivaravgifter på den (Skatteverket), och den anställde tar inte upp ersättningen i sin deklaration när utgiften är företagets (Skatteverket).",
        "Skatteverket utgår från att den anställde får tillbaka pengarna i nära anslutning till utlägget, mot uppvisande av kvitto eller liknande handling. Betala därför tillbaka regelbundet, till exempel en gång i månaden, och bara mot kvitto.",
      ],
    },
    {
      heading: "Moms på utlägg",
      body: [
        "Företaget får dra av den ingående momsen på ett utlägg om inköpet hör till en verksamhet som ger rätt till avdrag och det är ett utlägg för företagets räkning, inte en kostnadsersättning. Avdraget ska normalt styrkas med en faktura (mervärdesskattelagen 13 kap. 32 §), och ett vanligt kvitto från en butik är ofta en förenklad faktura. För vissa inköp är avdraget begränsat, till exempel representation som en kundlunch (Skatteverket, Avdrag för moms vid representation).",
        "Kvittot behöver inte ha företagets namn. Skatteverket godtar att kvittot för ett utlägg saknar köparens namn eller har den anställdes namn i stället för företagets, om den anställde har köpt för företagets räkning och får tillbaka pengarna mot kvittot.",
        "När avdraget görs beror på redovisningsmetoden: med faktureringsmetoden i den period då den anställde fick kvittot, med bokslutsmetoden normalt i den period då företaget betalar tillbaka utlägget (Skatteverket, Hur avdraget ska styrkas). Momsen i en kostnadsersättning får företaget i regel inte dra av, eftersom den anställde inte tar ut moms av företaget (Skatteverket, Hur avdraget ska styrkas). Särskilda regler gäller drivmedel när en anställd kör egen bil i tjänsten.",
      ],
    },
    {
      heading: "Förenklad faktura: gränsen 4 000 kronor",
      body: [
        "Ett kvitto får vara en förenklad faktura om totalbeloppet är högst 4 000 kronor inklusive moms, och i vissa andra fall, till exempel betalautomater för parkering och drivmedel (mervärdesskattelagen 17 kap. 26 §). En förenklad faktura ska minst innehålla (17 kap. 28 §):",
      ],
      list: [
        "datum när den utfärdades;",
        "uppgift som identifierar säljaren, enligt Skatteverket säljarens momsregistreringsnummer eller organisations- eller personnummer;",
        "vilken typ av varor eller tjänster köpet gäller;",
        "momsbeloppet eller uppgifter som gör det möjligt att räkna fram det, enligt Skatteverket beskattningsunderlaget och momssatsen. Bara totalbeloppet inklusive moms räcker inte (Skatteverket).",
      ],
    },
    {
      heading: "Över 4 000 kronor: fullständig faktura",
      body: [
        "Är beloppet högre ska underlaget vara en fullständig faktura, med bland annat löpnummer, säljarens momsregistreringsnummer, säljarens och köparens namn och adress, beskattningsunderlag, momssats och momsbelopp (17 kap. 24 §). Vid ett utlägg får den anställdes namn stå där företagets namn annars skulle stå (Skatteverket). Be gärna säljaren om en faktura i företagets namn redan vid köpet.",
      ],
    },
    {
      heading: "Kvitton i utländsk valuta",
      body: [
        "Företagets redovisningsvaluta är svenska kronor; aktiebolag och vissa andra företag, till exempel ekonomiska föreningar, får i stället ha euro (bokföringslagen 4 kap. 6 §). Ett kvitto i euro eller dollar bokförs därför i kronor. Ett praktiskt sätt är att betala tillbaka det belopp i kronor som den anställde faktiskt betalade enligt sitt kort- eller kontoutdrag, och spara utdraget med kvittot.",
        "Utländsk moms får aldrig dras av i den svenska momsdeklarationen (Skatteverket). Företaget kan i vissa fall få tillbaka momsen från landet där den betalades. Inom EU ansöker ett momsregistrerat svenskt företag i Skatteverkets e-tjänst Momsåterbetalning inom EU, senast den 30 september året efter inköpen och med ett minsta belopp (50 euro för ett helt kalenderår). För inköp under 2026 är sista dagen den 30 september 2027, men e-tjänsten stänger tillfälligt den 31 december 2026: ansök före dess om du kan, och läs Skatteverkets sida om hur du ansöker efter det. Utanför EU gäller varje lands egna regler.",
      ],
    },
    {
      heading: "Om kvittot har kommit bort",
      body: [
        "Även utan kvitto ska köpet ha en verifikation (5 kap. 6 §). Saknas underlaget måste företaget själv upprätta en verifikation med alla uppgifter som ska ingå (verksamt.se): när den upprättades, när köpet gjordes, vad det gällde, beloppet och säljaren. Bifoga det som finns, till exempel kort- eller kontoutdrag, en bokningsbekräftelse eller ett mejl från säljaren, och be säljaren om en kopia av kvittot.",
        "Momsen: avdraget ska normalt styrkas med en faktura (mervärdesskattelagen 13 kap. 32 §), så utan kvitto blir det i regel inget momsavdrag. Ersättningen: Skatteverkets beskrivning av ett utlägg utgår från att den anställde får tillbaka pengarna mot kvitto eller liknande handling. Utan underlag är det inte lika tydligt att det är ett utlägg, så fråga din redovisningskonsult hur ni ska hantera ersättningen i just ert fall.",
      ],
    },
    {
      heading: "Så gör du med UnReceipt",
      body: [
        "Den anställde fotar kvittot i appen eller vidarebefordrar kvittomejlet och skickar det för godkännande, med uppgift om vem som betalade: den anställde själv eller företaget. Du som ägare, eller den attestant du har gett den anställde, godkänner kvittot, skickar tillbaka det för rättning eller avslår det; de två sista med en kommentar. Ändrar den anställde belopp, moms, datum, säljare eller vem som betalade efter godkännandet ska kvittot godkännas igen, och varje steg loggas.",
        "Godkända utlägg som den anställde betalade listas per person och valuta som att betala tillbaka, och du markerar dem som betalda. Är ni kopplade till en redovisningsbyrå ser byrån en anställds kvitton först när de är godkända. Ett kvitto i utländsk valuta behåller sitt belopp och visas också i företagets valuta: som uppskattning med Europeiska centralbankens referenskurs när den finns, eller med beloppet från kontoutdraget om den anställde skriver in det. Listan över vad som ska betalas tillbaka visar uppskattningen tills kontoutdragets belopp är inskrivet.",
        "Det här gör UnReceipt inte (än):",
      ],
      list: [
        "Ingen utbetalning och ingen lönefil: ni betalar tillbaka via banken eller lönen som vanligt.",
        "Funktionen för anställda och godkännande är ny (pilot).",
        "Webbappen är bara på engelska; iPhone-appen finns även på svenska.",
        "Raderar en anställd sitt konto raderas hens kvitton också, och företaget behåller ingen kopia. Din egen export innehåller bara dina egna kvitton. Be därför den anställde ladda ner sina kvitton innan kontot raderas (exporten i appen); är ni kopplade till en redovisningsbyrå finns de godkända kvitton som byrån redan har exporterat kvar i byråns export, men inte de som byrån inte hann exportera. Företaget ska spara verifikationerna under hela bevarandetiden.",
      ],
    },
  ],
  faqTitle: "Vanliga frågor",
  faq: [
    {
      q: "Måste kvittot stå på företagets namn?",
      a: "Nej, inte vid ett utlägg. Skatteverket godtar att kvittot saknar köparens namn eller har den anställdes namn, om den anställde har köpt för företagets räkning och får tillbaka pengarna mot kvittot. Är beloppet över 4 000 kronor inklusive moms ska underlaget i övrigt vara en fullständig faktura.",
    },
    {
      q: "Räcker ett kortutdrag som underlag?",
      a: "Inte för momsen. Ett kortutdrag visar att något har betalats men oftast inte vad som köptes eller hur mycket moms det var, och momsavdraget ska normalt styrkas med en faktura. Har kvittot kommit bort upprättar företaget en egen verifikation och bifogar utdraget.",
    },
    {
      q: "Får den anställde slänga papperskvittot?",
      a: "Kvittot är företagets, inte den anställdes. Sedan den 1 juli 2024 får papperet slängas när kvittot har förts över till digital form utan risk för att uppgifterna ändras eller försvinner (bokföringslagen 7 kap. 6 §). Kontrollera att bilden är skarp och att hela kvittot syns innan papperet slängs.",
    },
    {
      q: "Vad gäller för ett kvitto i euro?",
      a: "Det bokförs i kronor, företagets redovisningsvaluta (ett aktiebolag får i stället ha euro). Momsen på kvittot är utländsk och får inte dras av i den svenska momsdeklarationen, men inom EU kan företaget ansöka om att få tillbaka den från landet där den betalades.",
    },
  ],
  sourcesTitle: "Källor",
  sources: [
    S.bfl,
    S.bfnEmployees,
    S.bfnArchiveFaq,
    S.verksamtVer,
    S.skvOutlayVsAllowance,
    S.skvAllowancePrivate,
    S.ml,
    S.skvVatProof,
    S.skvInvoice,
    S.skvRepresentation,
    S.skvForeignVat,
  ],
  updatedLabel: "Senast granskad",
  disclaimer:
    "Guiden förklarar reglerna översiktligt och är inte juridisk rådgivning. Fråga din redovisningskonsult om din egen situation.",
  cta: {
    title: "Låt de anställda skicka kvittona för godkännande",
    lead: "De anställda fotar kvittot, du godkänner det och ser vad som ska betalas tillbaka. Din redovisningskonsult ser kvittona när de är godkända.",
    secondaryLabel: "Boka en demo på 20 minuter",
  },
  relatedTitle: "Läs mer",
  related: [
    { label: "Hur länge ska man spara kvitton?", page: "guideRetention" },
    { label: "Får man slänga papperskvitton?", page: "guidePaper" },
    { label: "Vad är UnReceipt? Fakta och begränsningar", page: "about" },
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
        "L’article L123-22 du Code de commerce dispose que « les documents comptables et les pièces justificatives sont conservés pendant dix ans ». En pratique, le délai court à partir de la clôture de l’exercice : pour un exercice clos le 31 décembre 2026, les justificatifs sont conservés jusqu’au 31 décembre 2036.",
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
        "Le micro-entrepreneur tient un livre des recettes et, s’il vend des marchandises, des denrées à consommer sur place ou à emporter, ou fournit un logement, un registre des achats (article L123-28 du Code de commerce). Il conserve ces registres et ses pièces justificatives : dix ans pour les commerçants (article L123-22), et au minimum le délai fiscal de l’article L102 B pour tous les indépendants, y compris en BNC. Le plus simple : tout garder dix ans.",
      ],
    },
    {
      heading: "Et la version numérique ?",
      body: [
        "Une facture papier ne peut être détruite après numérisation que si la copie est conforme à l’original en image et en contenu, selon l’article A102 B-2 du Livre des procédures fiscales : reproduction à l’identique sans traitement de l’image, PDF muni d’un cachet serveur, d’une empreinte numérique ou d’une signature électronique, et horodatage. Pour les autres justificatifs, comme les tickets de caisse, la prudence est la même : gardez l’original papier.",
        "UnReceipt ne produit pas ce type de copie : utilisez-le pour lire, classer et transmettre vos justificatifs, et conservez vos originaux papier. Les reçus reçus par e-mail sont en principe gardés tels qu’ils sont arrivés, avec un PDF une fois vérifiés, et hébergés dans l’UE, à Francfort. Les factures électroniques reçues via votre plateforme agréée restent à conserver sous leur forme d’origine : la copie transférée à UnReceipt ne les remplace pas.",
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
    secondaryLabel: "Demander une démo",
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
        "À partir du 1er janvier 2027, le délai fiscal de conservation passe de six à dix ans pour les documents encore dans le délai de six ans à cette date (loi n° 2026-534, article 36).",
      ],
    },
    {
      heading: "Avec UnReceipt",
      body: [
        "UnReceipt ne produit pas de copie conforme au sens de l’article A102 B-2. Utilisez-le pour lire, classer et transmettre vos reçus à votre expert-comptable, et conservez vos tickets et factures papier dix ans. Les reçus qui arrivent par e-mail sont en principe gardés tels qu’ils sont arrivés, avec un PDF une fois vérifiés, et hébergés dans l’UE, à Francfort. Les factures électroniques reçues via votre plateforme agréée restent à conserver sous leur forme d’origine.",
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
    secondaryLabel: "Demander une démo",
  },
  relatedTitle: "À lire aussi",
  related: [
    { label: "Combien de temps conserver les justificatifs ?", page: "guideRetention" },
    { label: "UnReceipt pour les indépendants", page: "freelancers" },
    { label: "UnReceipt pour les experts-comptables", page: "accountants" },
  ],
};

export const GUIDES: readonly Guide[] = [
  retentionEn,
  retentionSv,
  paperSv,
  outlaysSv,
  retentionFr,
  paperFr,
];

export function getGuide(page: GuidePageId, locale: Locale): Guide {
  const guide = GUIDES.find((g) => g.page === page && g.locale === locale);
  if (!guide) throw new Error(`No ${locale} guide for ${page}`);
  return guide;
}

const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" };

/** A guide's date as the page shows it ("8 november 2026"). */
export function formatGuideDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** The guides of one language, most recently reviewed first. */
export function guidesFor(locale: Locale): Guide[] {
  return GUIDES.filter((g) => g.locale === locale).sort(
    (a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title)
  );
}

/** Words of the guides index page (`/guides`, `/sv/guider`, `/fr/guides`). */
export type GuidesIndexCopy = {
  /** The <title>. */
  metaTitle: string;
  description: string;
  /** Its name in breadcrumbs (on the index and on every guide). */
  breadcrumb: string;
  eyebrow: string;
  title: string;
  lead: string;
  updatedLabel: string;
  readLabel: string;
};

export const GUIDES_INDEX: Record<Locale, GuidesIndexCopy> = {
  en: {
    metaTitle: "Guides: receipt rules for small businesses | UnReceipt",
    description:
      "Plain-language guides to the rules for receipts and bookkeeping records, with their legal sources and the date each was last checked.",
    breadcrumb: "Guides",
    eyebrow: "Guides",
    title: "Receipt rules, explained",
    lead: "Short answers first, then the detail. Every guide cites its legal sources and says when it was last checked.",
    updatedLabel: "Last reviewed",
    readLabel: "Read the guide",
  },
  sv: {
    metaTitle: "Guider om kvitton och bokföring | UnReceipt",
    description:
      "Guider om reglerna för kvitton och verifikationer i Sverige, med lagkällor och datum för när de senast granskades.",
    breadcrumb: "Guider",
    eyebrow: "Guider",
    title: "Reglerna för kvitton, förklarade",
    lead: "Det korta svaret först, sedan detaljerna. Varje guide anger sina källor och när den senast granskades.",
    updatedLabel: "Senast granskad",
    readLabel: "Läs guiden",
  },
  fr: {
    metaTitle: "Guides : les règles des justificatifs | UnReceipt",
    description:
      "Des guides clairs sur les règles des tickets de caisse et des justificatifs comptables en France, avec leurs sources et leur date de vérification.",
    breadcrumb: "Guides",
    eyebrow: "Guides",
    title: "Les règles des justificatifs, expliquées",
    lead: "La réponse courte d’abord, puis le détail. Chaque guide cite ses sources et indique quand il a été vérifié.",
    updatedLabel: "Dernière vérification",
    readLabel: "Lire le guide",
  },
};
