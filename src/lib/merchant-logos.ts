/**
 * Store logos for well-known merchants. A short, hand-checked list keyed
 * by a slug: a wrong logo on an accounting record is worse than none, so
 * we never guess from a web search — unknown merchants keep their
 * initials badge (merchant-display.ts).
 *
 * The browser asks /api/merchant-logo/<slug>; the server fetches the
 * site's icon so the customer's IP and the merchant never reach the icon
 * service. Pure — safe to import from client and server.
 */

type LogoEntry = {
  /** The site whose icon we show. */
  domain: string;
  /**
   * Whole words (lower case, accents stripped) that identify the
   * merchant. All words of one pattern must appear in order at the start
   * of a word.
   */
  match: string[];
};

// Ambiguous names are left out (SAS — also a French company form —, SL,
// Max, Bolt, Paul, Relay, Total) or need their company suffix ("Slack
// Technologies", not a bar called Slack).
export const MERCHANT_LOGOS: Record<string, LogoEntry> = {
  // Sweden — groceries and shops
  ica: { domain: "ica.se", match: ["ica"] },
  coop: { domain: "coop.se", match: ["coop"] },
  willys: { domain: "willys.se", match: ["willys"] },
  hemkop: { domain: "hemkop.se", match: ["hemkop"] },
  lidl: { domain: "lidl.se", match: ["lidl"] },
  systembolaget: { domain: "systembolaget.se", match: ["systembolaget"] },
  apoteket: { domain: "apoteket.se", match: ["apoteket"] },
  apotek_hjartat: { domain: "apotekhjartat.se", match: ["apotek hjartat"] },
  pressbyran: { domain: "pressbyran.se", match: ["pressbyran"] },
  "7eleven": { domain: "7-eleven.se", match: ["7-eleven", "7 eleven", "seven eleven"] },
  clas_ohlson: { domain: "clasohlson.com", match: ["clas ohlson"] },
  ikea: { domain: "ikea.com", match: ["ikea"] },
  elgiganten: { domain: "elgiganten.se", match: ["elgiganten"] },
  webhallen: { domain: "webhallen.com", match: ["webhallen"] },
  kjell: { domain: "kjell.com", match: ["kjell & company", "kjell och company", "kjell company"] },
  biltema: { domain: "biltema.se", match: ["biltema"] },
  jula: { domain: "jula.se", match: ["jula"] },
  bauhaus: { domain: "bauhaus.se", match: ["bauhaus"] },
  espresso_house: { domain: "espressohouse.com", match: ["espresso house"] },
  // Sweden — travel and fuel
  sj: { domain: "sj.se", match: ["sj"] },
  arlanda_express: { domain: "arlandaexpress.se", match: ["arlanda express"] },
  taxi_stockholm: { domain: "taxistockholm.se", match: ["taxi stockholm"] },
  circle_k: { domain: "circlek.se", match: ["circle k"] },
  preem: { domain: "preem.se", match: ["preem"] },
  okq8: { domain: "okq8.se", match: ["okq8"] },
  scandic: { domain: "scandichotels.com", match: ["scandic"] },
  norwegian: { domain: "norwegian.com", match: ["norwegian air"] },
  // France
  sncf: { domain: "sncf-connect.com", match: ["sncf"] },
  carrefour: { domain: "carrefour.fr", match: ["carrefour"] },
  monoprix: { domain: "monoprix.fr", match: ["monoprix"] },
  franprix: { domain: "franprix.fr", match: ["franprix"] },
  auchan: { domain: "auchan.fr", match: ["auchan"] },
  fnac: { domain: "fnac.com", match: ["fnac"] },
  darty: { domain: "darty.com", match: ["darty"] },
  totalenergies: { domain: "totalenergies.fr", match: ["totalenergies"] },
  // Everywhere
  uber: { domain: "uber.com", match: ["uber"] },
  airbnb: { domain: "airbnb.com", match: ["airbnb"] },
  booking: { domain: "booking.com", match: ["booking.com"] },
  mcdonalds: { domain: "mcdonalds.com", match: ["mcdonald's", "mcdonalds"] },
  starbucks: { domain: "starbucks.com", match: ["starbucks"] },
  amazon: { domain: "amazon.com", match: ["amazon"] },
  apple: { domain: "apple.com", match: ["apple.com", "apple store", "apple distribution"] },
  google: { domain: "google.com", match: ["google"] },
  microsoft: { domain: "microsoft.com", match: ["microsoft"] },
  adobe: { domain: "adobe.com", match: ["adobe"] },
  spotify: { domain: "spotify.com", match: ["spotify"] },
  slack: { domain: "slack.com", match: ["slack technologies"] },
  zoom: { domain: "zoom.us", match: ["zoom.us", "zoom video"] },
  notion: { domain: "notion.so", match: ["notion labs"] },
  figma: { domain: "figma.com", match: ["figma"] },
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Compiled once: "clas ohlson" matches "Clas Ohlson Drottninggatan" but
// "uber" doesn't match "Kuberna".
const MATCHERS: Array<{ slug: string; re: RegExp }> = Object.entries(
  MERCHANT_LOGOS,
).flatMap(([slug, entry]) =>
  entry.match.map((pattern) => ({
    slug,
    re: new RegExp(`(^|[^a-z0-9])${escapeRegExp(pattern)}($|[^a-z0-9])`),
  })),
);

/** The logo slug for a merchant name, or null when we don't know it. */
export function merchantLogoSlug(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalize(name);
  if (!n) return null;
  return MATCHERS.find(({ re }) => re.test(n))?.slug ?? null;
}

/** The domain behind a slug, only for slugs on the list. */
export function merchantLogoDomain(slug: string): string | null {
  return Object.hasOwn(MERCHANT_LOGOS, slug) ? MERCHANT_LOGOS[slug].domain : null;
}
