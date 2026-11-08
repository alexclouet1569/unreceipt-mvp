# SEO and distribution plan (2026-11-08)

What shipped in code, and the distribution work code can't do. Audience: the founder.

## The honest starting point

- The site was effectively one page per language. Google could rank it for "UnReceipt" and little else. A new domain with no backlinks won't rank for head terms ("kvittohantering", "receipt app") for months, whatever is on the page.
- So SEO is a 3–9 month compounding channel. **The fastest channel for this product is accounting firms**: one firm brings 10–100 client companies. SEO should support that channel (firms check you out on Google before a call), not replace it.

## What shipped (this change)

| Page | EN | SV | FR | Intent it targets |
|---|---|---|---|---|
| Home (repositioned) | `/` | `/sv` | `/fr` | "receipt app small business", "kvittohantering", "gestion des justificatifs" |
| Accounting firms | `/accountants` | `/sv/redovisningsbyra` | `/fr/experts-comptables` | "kvittohantering redovisningsbyrå", "collecte justificatifs expert-comptable" |
| Freelancers / sole traders | `/freelancers` | `/sv/enskild-firma` | `/fr/independants` | "kvitton enskild firma", "justificatifs auto-entrepreneur" |
| Guide: retention | `/guides/how-long-to-keep-receipts` | `/sv/guider/hur-lange-ska-man-spara-kvitton` | `/fr/guides/duree-de-conservation-des-justificatifs` | "hur länge ska man spara kvitton", "durée de conservation des justificatifs" |
| Guide: paper originals | – | `/sv/guider/fa-man-slanga-papperskvitton` | `/fr/guides/jeter-les-tickets-de-caisse-apres-numerisation` | "slänga papperskvitton", "jeter tickets de caisse" |

Technical: keyword-first `<title>`s and descriptions, a keyword `<h1>` on the home page (the slogan stays as the visual headline), hreflang between translated pages, JSON-LD (Organization, SoftwareApplication with audiences and features, WebPage, BreadcrumbList, FAQPage, Article), sitemap generated from one page registry, share image on every page (the /sv and /fr pages were losing it), footer links between all pages, llms.txt with audiences, guides and the firm FAQ for AI assistants. French FAQ corrected: the tax retention period becomes 10 years on 1 Jan 2027; A102 B-2 is a *copie conforme* for paper invoices.

## Do this week (founder, ~2 hours)

1. **Google Search Console**: the site is already verified. Submit `https://unreceipt.com/sitemap.xml`, then use URL Inspection → "Request indexing" on the 6 audience pages and 5 guides.
2. **Bing Webmaster Tools**: import from Search Console (one click), submit the sitemap. Bing also feeds ChatGPT search and Copilot.
3. **Google Business Profile** for UnReceipt (service-area business, Sweden). Cheap, and it's a trust signal.
4. **LinkedIn company page** + add `sameAs` URLs (LinkedIn, etc.) to the Organization JSON-LD in `src/lib/seo.ts` once they exist.

## Backlinks and listings (weeks 1–4)

Rank by value, highest first:

1. **Pilot accounting firm**: ask them to link to UnReceipt from their "verktyg/digitala tjänster" or client-onboarding page. One relevant link from a real redovisningsbyrå is worth more than 50 directory links.
2. **Software directories**: Capterra / GetApp / Software Advice (one Gartner listing feeds all three), G2, Product Hunt (launch the accountant portal as its own launch), AlternativeTo (list as an alternative to Dext, Expensify, Fortnox Kvitto & Utlägg).
3. **Swedish**: Breakit/Driva Eget tips, Företagarna partner offers, Almi/Nyföretagarcentrum resource lists, Srf konsulterna and FAR member newsletters (accountant associations: a "member offer" for firms).
4. **French**: Ordre des experts-comptables regional newsletters, "outils pour expert-comptable" roundups, Pennylane/Tiime community forums (only once there's a real story).

## Content calendar (one piece every 2 weeks, compounding)

Write only what you can source; every guide keeps its "last reviewed" date and sources. Candidates, by search demand:

- SV: "Vad ska ett kvitto innehålla?" (BFL 5 kap. 7 §, förenklad faktura up to 4 000 kr incl. moms), "Representation moms 2026" (figures changed with 6 % food VAT from 1 Apr 2026, check before writing), "Utlägg i enskild firma", "Kvitto på utländsk valuta i bokföringen".
- FR: "Note de frais : quels justificatifs ?", "Facture ou ticket de caisse pour récupérer la TVA", "Facturation électronique 2026–2027 : ce qui change pour les reçus".
- EN: "Receipt apps compared for Swedish small businesses" (only with verified facts about competitors), "How accounting firms collect client receipts".
- Comparison pages ("UnReceipt vs Dext", "vs Fortnox Kvitto & Utlägg") convert best, but every claim about a competitor must be checked on their current site and dated.

## Accounting-firm channel (the real growth lever)

- The firm page CTA is "Book a demo" (mailto). Next step: a real booking link (Cal.com/Calendly) instead of mailto. It converts better and you can measure it.
- Give firms a **ready-made client invite email** and a one-page PDF in Swedish/French that they forward to clients. Each firm becomes a distribution channel.
- **Pricing for firms** (the feedback you got: a firm subscription with receipts included, no per-receipt fees): not changed in this work, as you asked. The firm page currently says the firm needs no plan and invites firms who want one agreement to talk to you. When you decide the model, it belongs in `src/lib/plans.ts` and a firm section on `/accountants`.

## What to measure

- Search Console: impressions and clicks per page, queries per page (monthly).
- Vercel Analytics: visits to `/accountants` → demo clicks (mailto) and signups by landing page.
- The signup digest already emails new accounts daily; add the landing page they came from when convenient.

## Not done, on purpose

- No fake testimonials, logos, review stars or customer counts. Add `AggregateRating` JSON-LD only when you have real reviews (e.g. from G2/Capterra).
- No pages for countries the product doesn't serve.
- No pricing change.
