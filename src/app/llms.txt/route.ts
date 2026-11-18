import { getFaq } from "@/lib/faq";
import { isPilotMode } from "@/lib/pilot";
import { PLANS, formatPrice } from "@/lib/plans";
import { SHOW_PRICES } from "@/lib/pricing-visibility";
import { AUDIENCE_COPY } from "@/app/_audience-copy";
import { getAbout } from "@/lib/about";
import { GUIDES } from "@/lib/guides";
import { MARKETING_PAGES } from "@/lib/marketing-pages";
import { DESCRIPTION, SITE_URL, absoluteUrl } from "@/lib/seo";

/**
 * /llms.txt — a plain-language summary of UnReceipt for AI assistants
 * (llmstxt.org convention). Built from the same plans and FAQ the landing
 * page renders, so it can't drift from the site.
 */
// Built once per deployment, like the marketing pages: PILOT_MODE is
// read at build time (src/lib/pilot.ts).
export const dynamic = "force-static";

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
  const forSmallBusiness = AUDIENCE_COPY.smallBusiness.en.faq
    .map((item) => `### ${item.q}\n${item.a}`)
    .join("\n\n");
  const about = getAbout("en", pilot);
  const page = (id: keyof typeof MARKETING_PAGES, lang: "en" | "sv" | "fr") =>
    absoluteUrl(MARKETING_PAGES[id].paths[lang]!);
  const guides = GUIDES.map((g) => `- [${g.title}](${absoluteUrl(MARKETING_PAGES[g.page].paths[g.locale]!)}) (${g.locale}): ${g.answer}`).join("\n");

  const body = `# UnReceipt

> ${DESCRIPTION}

UnReceipt is a receipt service for small businesses, freelancers and sole traders, and the accounting firms that keep their books, in Sweden and France${pilot ? ". It is currently in a free pilot" : ""}. Companies forward email receipts to a private UnReceipt address, connect a Gmail or Outlook mailbox, or photograph paper receipts in the app. AI (Anthropic's Claude) reads each receipt into a record (merchant, date, total, currency, category, and line items, VAT amount and rate when the receipt shows them): a photo in seconds, an email as soon as it arrives. Nobody at UnReceipt checks receipts by hand: the user checks the fields when saving a photo, and email receipts and receipts that can't be read with confidence wait in Review needed until the user or their accountant confirms them. The receipt file (the photo as uploaded, or the forwarded email) is kept, with a PDF once the receipt is complete. Receipts in EUR, USD, GBP, NOK, DKK, ISK, CHF, PLN, CZK, HUF, RON, TRY and SEK get an estimated home-currency amount from the ECB reference rate of the purchase day.

Accounting firms get a portal with every linked client company: which receipts need a check, completing and correcting receipts, and a monthly export per client (ZIP with a bookkeeping CSV — one line per receipt and VAT rate with a suggested BAS account and input-VAT account 2640 — plus a PDF and the file of every receipt). Clients invite their accountant, or the firm invites the client; the firm itself needs no plan.

Companies can add employees (since November 2026, in pilot): an employee's receipts go to the company and are sent for approval, saying whether the employee paid with their own money or the company's card. The owner, or the approver assigned to that person, approves, sends back with a note or rejects; nobody approves their own receipt. Approved outlays paid by an employee are listed per person to pay back and marked paid by hand (no payout or payroll file). The accounting firm sees an employee's receipt only once it is approved. One price per company, no per-user fees.

## What UnReceipt doesn't do (yet)
${about.limits.map((l) => `- ${l}`).join("\n")}

${SHOW_PRICES ? `## Pricing (excl. VAT, one price per company, no per-user fees)\n${plans}\n` : `## Pricing\n${about.facts.find((f) => f.label === "Pricing")!.value}\n`}
## Who it's for
- [Small businesses with employees](${page("smallBusiness", "en")}): employees send receipts for approval, approved outlays are listed to pay back — Swedish: [småföretag](${page("smallBusiness", "sv")}), French: [TPE](${page("smallBusiness", "fr")})
- [Accounting firms](${page("accountants", "en")}) — Swedish: [redovisningsbyråer](${page("accountants", "sv")}), French: [experts-comptables](${page("accountants", "fr")})
- [Freelancers and sole traders](${page("freelancers", "en")}) — Swedish: [enskild firma](${page("freelancers", "sv")}), French: [indépendants](${page("freelancers", "fr")})

## Guides
All guides: [English](${page("guides", "en")}), [Swedish](${page("guides", "sv")}), [French](${page("guides", "fr")})

${guides}

## Links
- [About UnReceipt: facts, pricing and limits](${page("about", "en")}) — Swedish: [Om UnReceipt](${page("about", "sv")}), French: [À propos](${page("about", "fr")})
- [Full site content in one file](${SITE_URL}/llms-full.txt)
- [Website](${SITE_URL})
- [Svenska / Swedish site, prices in SEK](${SITE_URL}/sv)
- [Français / French site](${SITE_URL}/fr)
${SHOW_PRICES ? `- [Pricing](${SITE_URL}/#pricing)\n` : ""}- [How it works](${SITE_URL}/#how)
- [FAQ](${page("faq", "en")}) — Swedish: [Vanliga frågor](${page("faq", "sv")}), French: [FAQ](${page("faq", "fr")})
- [Privacy & data](${SITE_URL}/privacy)
- [Book a 20-minute demo or ask a question](${page("bookDemo", "en")}) — Swedish: [Boka demo](${page("bookDemo", "sv")}) — French: [Demander une démo](${page("bookDemo", "fr")})
- Contact: support@unreceipt.com

## FAQ
${faq}

## FAQ for accounting firms
${forFirms}

## FAQ for freelancers
${forFreelancers}

## FAQ for small businesses with employees
${forSmallBusiness}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
