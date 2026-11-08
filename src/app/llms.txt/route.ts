import { getFaq } from "@/lib/faq";
import { isPilotMode } from "@/lib/pilot";
import { PLANS, formatPrice } from "@/lib/plans";
import { AUDIENCE_COPY } from "@/app/_audience-copy";
import { GUIDES } from "@/lib/guides";
import { MARKETING_PAGES } from "@/lib/marketing-pages";
import { DESCRIPTION, SITE_URL, absoluteUrl } from "@/lib/seo";

/**
 * /llms.txt — a plain-language summary of UnReceipt for AI assistants
 * (llmstxt.org convention). Built from the same plans and FAQ the landing
 * page renders, so it can't drift from the site.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const pilot = isPilotMode();
  const plans = PLANS.map(
    (p) =>
      `- ${p.name}: ${formatPrice(p.price)}/month, up to ${p.receipts} receipts per month — ${p.who}`
  ).join("\n");
  const faq = getFaq(pilot)
    .map((item) => `### ${item.q}\n${item.a}`)
    .join("\n\n");

  const forFirms = AUDIENCE_COPY.accountants.en.faq
    .map((item) => `### ${item.q}\n${item.a}`)
    .join("\n\n");
  const forFreelancers = AUDIENCE_COPY.freelancers.en.faq
    .map((item) => `### ${item.q}\n${item.a}`)
    .join("\n\n");
  const page = (id: keyof typeof MARKETING_PAGES, lang: "en" | "sv" | "fr") =>
    absoluteUrl(MARKETING_PAGES[id].paths[lang]!);
  const guides = GUIDES.map((g) => `- [${g.title}](${absoluteUrl(MARKETING_PAGES[g.page].paths[g.locale]!)}) (${g.locale}): ${g.answer}`).join("\n");

  const body = `# UnReceipt

> ${DESCRIPTION}

UnReceipt is a receipt service for small businesses, freelancers and sole traders, and the accounting firms that keep their books, in Sweden and France${pilot ? ". It is currently in a free pilot" : ""}. Companies forward email receipts to a private UnReceipt address or photograph paper receipts in the app. Each receipt becomes a VAT-ready record (merchant, date, line items, VAT amount and rate, category) within 24 hours, checked by a concierge. The receipt's original file and a PDF are kept for every receipt. Foreign-currency receipts get the home-currency amount from the ECB reference rate of the purchase day.

Accounting firms get a portal with every linked client company: which receipts need a check, completing and correcting receipts, and a monthly export per client (ZIP with a bookkeeping CSV — one line per receipt and VAT rate with a suggested BAS account and input-VAT account 2640 — plus a PDF and the original of every receipt). Clients invite their accountant, or the firm invites the client; the firm itself needs no plan.

## Pricing (excl. VAT, one price per company, no per-user fees)
${plans}

## Who it's for
- [Small businesses](${SITE_URL})
- [Accounting firms](${page("accountants", "en")}) — Swedish: [redovisningsbyråer](${page("accountants", "sv")}), French: [experts-comptables](${page("accountants", "fr")})
- [Freelancers and sole traders](${page("freelancers", "en")}) — Swedish: [enskild firma](${page("freelancers", "sv")}), French: [indépendants](${page("freelancers", "fr")})

## Guides
${guides}

## Links
- [Website](${SITE_URL})
- [Svenska / Swedish site, prices in SEK](${SITE_URL}/sv)
- [Français / French site](${SITE_URL}/fr)
- [Pricing](${SITE_URL}/#pricing)
- [How it works](${SITE_URL}/#how)
- [Interactive demo, company and accountant side](https://app.unreceipt.com/demo)
- [FAQ](${SITE_URL}/#faq)
- [Privacy & data](${SITE_URL}/privacy)
- Contact: support@unreceipt.com

## FAQ
${faq}

## FAQ for accounting firms
${forFirms}

## FAQ for freelancers
${forFreelancers}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
