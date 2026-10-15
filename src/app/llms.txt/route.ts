import { getFaq } from "@/lib/faq";
import { isPilotMode } from "@/lib/pilot";
import { PLANS, formatPrice } from "@/lib/plans";
import { DESCRIPTION, SITE_URL } from "@/lib/seo";

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

  const body = `# UnReceipt

> ${DESCRIPTION}

UnReceipt is a receipt service for small businesses in Sweden${pilot ? ", currently in a free pilot" : ""}. Companies forward email receipts to a private UnReceipt address or photograph paper receipts in the app. Each receipt becomes a VAT-ready record (merchant, date, line items, VAT rate and amount, merchant VAT number, category) within 24 hours, checked by a concierge. The original file and a PDF are kept for every receipt.

## Pricing (excl. VAT, one price per company, no per-user fees)
${plans}

## Links
- [Website](${SITE_URL})
- [Pricing](${SITE_URL}/#pricing)
- [How it works](${SITE_URL}/#how)
- [FAQ](${SITE_URL}/#faq)
- [Privacy & data](${SITE_URL}/privacy)
- Contact: support@unreceipt.com

## FAQ
${faq}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
