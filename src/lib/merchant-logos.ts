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
// Max, Bolt, Paul, Relay, Total, Avis — also French for "notice" —,
// Netto, Jumbo, Mango, Orange, Free, Casino alone, U alone; "boulanger"
// is also a baker and Picard a surname) or need their
// company suffix ("Slack Technologies", not a bar called Slack).
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
  leclerc: { domain: "e.leclerc", match: ["leclerc"] },
  intermarche: { domain: "intermarche.com", match: ["intermarche"] },
  super_u: { domain: "magasins-u.com", match: ["super u", "hyper u", "u express", "marche u"] },
  casino: { domain: "supercasino.fr", match: ["geant casino", "petit casino", "casino supermarche", "casino shop"] },
  picard: { domain: "picard.fr", match: ["picard surgeles"] },
  biocoop: { domain: "biocoop.fr", match: ["biocoop"] },
  naturalia: { domain: "naturalia.fr", match: ["naturalia"] },
  decathlon: { domain: "decathlon.com", match: ["decathlon"] },
  leroy_merlin: { domain: "leroymerlin.fr", match: ["leroy merlin"] },
  castorama: { domain: "castorama.fr", match: ["castorama"] },
  boulanger: { domain: "boulanger.com", match: ["boulanger.com", "boulanger sa"] },
  cultura: { domain: "cultura.com", match: ["cultura.com", "cultura sas"] },
  sephora: { domain: "sephora.com", match: ["sephora"] },
  galeries_lafayette: { domain: "galerieslafayette.com", match: ["galeries lafayette"] },
  brioche_doree: { domain: "briochedoree.fr", match: ["brioche doree"] },
  air_france: { domain: "airfrance.com", match: ["air france"] },
  ratp: { domain: "ratp.fr", match: ["ratp"] },
  ouigo: { domain: "ouigo.com", match: ["ouigo"] },
  blablacar: { domain: "blablacar.fr", match: ["blablacar"] },
  vinci_autoroutes: { domain: "vinci-autoroutes.com", match: ["vinci autoroutes"] },
  sanef: { domain: "sanef.com", match: ["sanef"] },
  sfr: { domain: "sfr.fr", match: ["sfr"] },
  bouygues_telecom: { domain: "bouyguestelecom.fr", match: ["bouygues telecom"] },
  // Europe
  aldi: { domain: "aldi.com", match: ["aldi"] },
  rewe: { domain: "rewe.de", match: ["rewe"] },
  edeka: { domain: "edeka.de", match: ["edeka"] },
  dm: { domain: "dm.de", match: ["dm drogerie markt", "dm-drogerie markt"] },
  rossmann: { domain: "rossmann.de", match: ["rossmann"] },
  mediamarkt: { domain: "mediamarkt.de", match: ["media markt", "mediamarkt"] },
  albert_heijn: { domain: "ah.nl", match: ["albert heijn"] },
  tesco: { domain: "tesco.com", match: ["tesco"] },
  sainsburys: { domain: "sainsburys.co.uk", match: ["sainsbury's", "sainsburys"] },
  mercadona: { domain: "mercadona.es", match: ["mercadona"] },
  el_corte_ingles: { domain: "elcorteingles.es", match: ["el corte ingles"] },
  esselunga: { domain: "esselunga.it", match: ["esselunga"] },
  rema_1000: { domain: "rema1000.no", match: ["rema 1000"] },
  elkjop: { domain: "elkjop.no", match: ["elkjop"] },
  zara: { domain: "zara.com", match: ["zara"] },
  hm: { domain: "hm.com", match: ["h&m", "h & m", "hennes & mauritz", "hennes och mauritz"] },
  primark: { domain: "primark.com", match: ["primark"] },
  pret: { domain: "pret.com", match: ["pret a manger"] },
  max_burgers: { domain: "maxburgers.com", match: ["max burgers", "max hamburgerrestauranger"] },
  burger_king: { domain: "burgerking.com", match: ["burger king"] },
  kfc: { domain: "kfc.com", match: ["kfc"] },
  deutsche_bahn: { domain: "bahn.de", match: ["deutsche bahn", "db fernverkehr", "db vertrieb"] },
  oebb: { domain: "oebb.at", match: ["oebb", "osterreichische bundesbahnen"] },
  trenitalia: { domain: "trenitalia.com", match: ["trenitalia"] },
  renfe: { domain: "renfe.com", match: ["renfe"] },
  eurostar: { domain: "eurostar.com", match: ["eurostar"] },
  flixbus: { domain: "flixbus.com", match: ["flixbus"] },
  lufthansa: { domain: "lufthansa.com", match: ["lufthansa"] },
  klm: { domain: "klm.com", match: ["klm"] },
  ryanair: { domain: "ryanair.com", match: ["ryanair"] },
  easyjet: { domain: "easyjet.com", match: ["easyjet"] },
  vueling: { domain: "vueling.com", match: ["vueling"] },
  finnair: { domain: "finnair.com", match: ["finnair"] },
  swiss: { domain: "swiss.com", match: ["swiss international air lines", "swiss air lines"] },
  hertz: { domain: "hertz.com", match: ["hertz"] },
  europcar: { domain: "europcar.com", match: ["europcar"] },
  sixt: { domain: "sixt.com", match: ["sixt"] },
  shell: { domain: "shell.com", match: ["shell"] },
  esso: { domain: "esso.com", match: ["esso"] },
  aral: { domain: "aral.de", match: ["aral"] },
  hilton: { domain: "hilton.com", match: ["hilton"] },
  marriott: { domain: "marriott.com", match: ["marriott"] },
  radisson: { domain: "radissonhotels.com", match: ["radisson"] },
  best_western: { domain: "bestwestern.com", match: ["best western"] },
  holiday_inn: { domain: "ihg.com", match: ["holiday inn"] },
  ibis: { domain: "ibis.com", match: ["ibis"] },
  novotel: { domain: "novotel.com", match: ["novotel"] },
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
  dropbox: { domain: "dropbox.com", match: ["dropbox"] },
  github: { domain: "github.com", match: ["github"] },
  linkedin: { domain: "linkedin.com", match: ["linkedin"] },
  canva: { domain: "canva.com", match: ["canva"] },
  atlassian: { domain: "atlassian.com", match: ["atlassian"] },
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
