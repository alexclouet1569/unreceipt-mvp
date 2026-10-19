import type { MatchableReceipt } from "@/lib/reconcile/match";
import type { StatementLine } from "@/lib/reconcile/parse-statement";

// Sample data for /demo/accountants: one made-up accounting firm and five
// made-up Malmö clients with their September statements. `receipts` is what
// the client has already sent to UnReceipt; `replies` is what arrives after
// the firm's reminder. The statuses are worked out by reconcile() at runtime,
// so the demo shows the real matching, not a scripted picture.

export const DEMO_FIRM = "Exempel Redovisning";
export const DEMO_PERIOD = "2026-09";

export type DemoClient = {
  id: string;
  name: string;
  kind: string;
  contactFirstName: string;
  contactEmail: string;
  forwardingAddress: string;
  statement: StatementLine[];
  receipts: MatchableReceipt[];
  /** Sent in reply to the reminder. */
  replies: MatchableReceipt[];
  /** What the client writes about the receipts they couldn't find. */
  replyNote: string | null;
};

let lineSeq = 0;
const ln = (day: number, text: string, amount: number, currency = "SEK"): StatementLine => ({
  id: `L${++lineSeq}`,
  date: `2026-09-${String(day).padStart(2, "0")}`,
  text,
  amount,
  currency,
});

let receiptSeq = 0;
const rc = (day: number, merchant: string, total: number, currency = "SEK"): MatchableReceipt => ({
  id: `R${++receiptSeq}`,
  merchant_name: merchant,
  total,
  currency,
  receipt_date: `2026-09-${String(day).padStart(2, "0")}`,
});

export const DEMO_CLIENTS: DemoClient[] = [
  {
    id: "kafe",
    name: "Möllevångens Kafé AB",
    kind: "Café · 4 staff",
    contactFirstName: "Anna",
    contactEmail: "anna@exempel-kafe.se",
    forwardingAddress: "receipts+k7m2q@in.unreceipt.com",
    statement: [
      ln(1, "KORTKÖP 260901 ICA MAXI MALMO", -2340.5),
      ln(2, "KORTKÖP 260902 SYSTEMBOLAGET", -1125),
      ln(3, "SWISH 0701234567 MÖLLANS BAGERI", -850),
      ln(4, "BG 5555-1234 MENIGO FOODSERVICE", -4980),
      ln(8, "CLAS OHLSON MALMO", -399),
      ln(10, "SKATTEVERKET 16 5591234567", -6210),
      ln(12, "ZETTLE UTBETALNING", 8450),
      ln(15, "IKEA MALMO", -1249),
      ln(18, "SPOTIFY", -129),
      ln(22, "RESTAURANG ATMOSFÄR", -1340),
      ln(25, "LÖN SEPTEMBER", -18400),
      ln(27, "BAUHAUS MALMO", -1899),
      ln(30, "Paketavgift", -125),
    ],
    receipts: [
      rc(1, "ICA Maxi Stormarknad", 2340.5),
      rc(2, "Systembolaget", 1125),
      rc(3, "Menigo Foodservice AB", 4980),
      rc(15, "IKEA", 1249),
      rc(17, "Spotify AB", 129),
      rc(22, "Restaurang Atmosfär", 1220),
    ],
    replies: [rc(3, "Möllans Bageri", 850), rc(8, "Clas Ohlson", 399)],
    replyNote: "Bauhaus: I can't find it, it was paint for the café wall.",
  },
  {
    id: "bygg",
    name: "Lindqvist Bygg & Måleri",
    kind: "Builder · sole trader",
    contactFirstName: "Johan",
    contactEmail: "johan@exempel-bygg.se",
    forwardingAddress: "receipts+b4x9t@in.unreceipt.com",
    statement: [
      ln(2, "BAUHAUS MALMO", -3420),
      ln(3, "CIRCLE K MALMO", -812.4),
      ln(5, "BILTEMA MALMO", -649),
      ln(9, "JULA MALMO", -1185),
      ln(11, "BG 5050-8811 AHLSELL SVERIGE", -7340),
      ln(14, "PREEM MALMO", -790.15),
      ln(16, "Inbetalning faktura 2031", 24500),
      ln(18, "BAUHAUS MALMO", -2264),
      ln(21, "CIRCLE K MALMO", -756.8),
      ln(24, "OKQ8 LUND", -701.3),
      ln(28, "BANKOMAT TRIANGELN", -1000),
    ],
    receipts: [rc(2, "Bauhaus", 3420), rc(11, "Ahlsell Sverige AB", 7340), rc(21, "Circle K", 756.8)],
    replies: [
      rc(3, "Circle K", 812.4),
      rc(5, "Biltema", 649),
      rc(9, "Jula", 1185),
      rc(14, "Preem", 790.15),
      rc(18, "Bauhaus", 2264),
    ],
    replyNote: "The OKQ8 one was my private car, sorry.",
  },
  {
    id: "studio",
    name: "Studio Ribban AB",
    kind: "Design studio · 6 staff",
    contactFirstName: "Sara",
    contactEmail: "sara@exempel-studio.se",
    forwardingAddress: "receipts+s2n8w@in.unreceipt.com",
    statement: [
      ln(1, "ADOBE *CREATIVE CLD", -1489),
      ln(2, "FIGMA", -158.9),
      ln(4, "SJ AB", -895),
      ln(5, "SCANDIC HOTELS", -1450),
      ln(6, "UBER *TRIP", -268.5),
      ln(10, "Inbetalning faktura 118", 46875),
      ln(12, "NOTION LABS", -112.4),
      ln(19, "ESPRESSO HOUSE", -468),
      ln(25, "LÖN SEPTEMBER", -92400),
      ln(29, "WEBHALLEN", -2490),
    ],
    receipts: [
      rc(1, "Adobe Systems Software Ireland Ltd", 1489),
      rc(2, "Figma, Inc.", 15, "USD"),
      rc(4, "SJ AB", 895),
      rc(5, "Scandic Hotels", 1450),
      rc(6, "Uber", 23.4, "EUR"),
      rc(12, "Notion Labs, Inc.", 112.4),
      rc(19, "Espresso House", 468),
    ],
    replies: [rc(29, "Webhallen", 2490)],
    replyNote: null,
  },
  {
    id: "fotvard",
    name: "Limhamns Fotvård",
    kind: "Clinic · sole trader",
    contactFirstName: "Maria",
    contactEmail: "maria@exempel-fotvard.se",
    forwardingAddress: "receipts+f6h3r@in.unreceipt.com",
    statement: [
      ln(1, "BG 5020-1144 HYRESVÄRDEN LIMHAMN", -7800),
      ln(4, "APOTEKET MALMO", -436),
      ln(9, "Inbetalning Swish", 3600),
      ln(15, "LIDL LIMHAMN", -212.9),
      ln(20, "TELIA SVERIGE", -399),
      ln(26, "SKATTEVERKET 16 7001234567", -3150),
    ],
    receipts: [
      rc(1, "Hyresvärden Limhamn AB", 7800),
      rc(4, "Apoteket", 436),
      rc(15, "Lidl", 212.9),
      rc(19, "Telia Sverige AB", 399),
    ],
    replies: [],
    replyNote: null,
  },
  {
    id: "it",
    name: "Nordsken IT-konsult",
    kind: "IT consultant · AB, 1 person",
    contactFirstName: "Erik",
    contactEmail: "erik@exempel-it.se",
    forwardingAddress: "receipts+n9d5k@in.unreceipt.com",
    statement: [
      ln(1, "MICROSOFT*365", -145),
      ln(3, "GOOGLE*WORKSPACE", -72),
      ln(8, "ELGIGANTEN MALMO", -4990),
      ln(12, "APPLE.COM/BILL", -129),
      ln(15, "Inbetalning faktura 2026-09", 78125),
      ln(17, "SJ AB", -1240),
      ln(23, "KJELL & COMPANY", -349),
    ],
    receipts: [
      rc(1, "Microsoft Ireland Operations Ltd", 145),
      rc(3, "Google Cloud EMEA Ltd", 72),
      rc(12, "Apple", 129),
      rc(20, "Pressbyrån", 54),
    ],
    replies: [rc(8, "Elgiganten", 4990), rc(17, "SJ AB", 1240), rc(23, "Kjell & Company", 349)],
    replyNote: null,
  },
];
