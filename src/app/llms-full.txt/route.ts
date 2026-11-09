import { AUDIENCE_COPY, type AudienceCopy } from "@/app/_audience-copy";
import { LANDING_COPY } from "@/app/_landing-copy";
import { ABOUT_AS_OF, getAbout, type About } from "@/lib/about";
import { getFaq, type FaqItem } from "@/lib/faq";
import { GUIDES, type Guide } from "@/lib/guides";
import type { Locale } from "@/lib/locale";
import { MARKETING_PAGES, pagePath } from "@/lib/marketing-pages";
import { isPilotMode } from "@/lib/pilot";
import { absoluteUrl } from "@/lib/seo";

/**
 * /llms-full.txt — the whole marketing site as one Markdown document, so an
 * AI assistant can read every fact, FAQ answer and guide in a single
 * request instead of crawling a dozen pages. Built from the same sources
 * as the pages (about.ts, faq.ts, _audience-copy.ts, guides.ts), so it
 * never says something the site doesn't.
 */
export const dynamic = "force-dynamic";

const faqMd = (items: FaqItem[]) => items.map((i) => `#### ${i.q}\n${i.a}`).join("\n\n");

function aboutMd(a: About, locale: Locale): string {
  return [
    `## ${a.title} (${locale})`,
    `Source: ${absoluteUrl(pagePath("about", locale))} — ${a.asOfLabel} ${ABOUT_AS_OF}`,
    a.summary,
    `### ${a.factsTitle}`,
    a.facts.map((f) => `- **${f.label}:** ${f.value}`).join("\n"),
    `### ${a.fitTitle}`,
    a.fit.map((f) => `- ${f}`).join("\n"),
    `### ${a.notFitTitle}`,
    a.notFit.map((f) => `- ${f}`).join("\n"),
    `### ${a.limitsTitle}`,
    a.limits.map((f) => `- ${f}`).join("\n"),
  ].join("\n\n");
}

function audienceMd(t: AudienceCopy, page: "accountants" | "freelancers", locale: Locale): string {
  return [
    `## ${t.meta.title.replace(/ \| UnReceipt$/, "")} (${locale})`,
    `Source: ${absoluteUrl(pagePath(page, locale))}`,
    t.hero.lead,
    `### ${t.steps.title}`,
    t.steps.items.map((s, i) => `${i + 1}. **${s.title}** — ${s.desc}`).join("\n"),
    `### ${t.features.title}`,
    t.features.items.map((f) => `- **${f.title}:** ${f.desc}`).join("\n"),
    `### ${t.faqTitle}`,
    faqMd(t.faq),
  ].join("\n\n");
}

function guideMd(g: Guide): string {
  return [
    `## ${g.title} (${g.locale})`,
    `Source: ${absoluteUrl(MARKETING_PAGES[g.page].paths[g.locale]!)} — ${g.updatedLabel} ${g.updated}`,
    `**${g.answerLabel}:** ${g.answer}`,
    ...g.sections.map((s) =>
      [`### ${s.heading}`, ...s.body, ...(s.list ? [s.list.map((l) => `- ${l}`).join("\n")] : [])].join("\n\n")
    ),
    `### ${g.faqTitle}`,
    faqMd(g.faq),
    `### ${g.sourcesTitle}`,
    g.sources.map((s) => `- [${s.label}](${s.url})`).join("\n"),
    `_${g.disclaimer}_`,
  ].join("\n\n");
}

export function GET() {
  const pilot = isPilotMode();
  const en = LANDING_COPY.en;
  const locales: Locale[] = ["en", "sv", "fr"];

  const body = [
    "# UnReceipt — full site content",
    "> Receipt management for small businesses, freelancers and sole traders, and accounting firms, in Sweden and France. Everything on unreceipt.com in one document; the short version is /llms.txt.",
    ...locales.map((l) => aboutMd(getAbout(l, pilot), l)),
    "## How it works (en)",
    en.how.items.map((s, i) => `${i + 1}. **${s.title}** — ${s.desc}`).join("\n"),
    en.features.items.map((f) => `- **${f.title}:** ${f.desc}`).join("\n"),
    ...locales.map((l) => `## FAQ (${l})\n\nSource: ${absoluteUrl(pagePath("home", l))}#faq\n\n${faqMd(getFaq(pilot, l))}`),
    ...locales.map((l) => audienceMd(AUDIENCE_COPY.accountants[l], "accountants", l)),
    ...locales.map((l) => audienceMd(AUDIENCE_COPY.freelancers[l], "freelancers", l)),
    ...GUIDES.map(guideMd),
    "## Contact\n\nsupport@unreceipt.com — https://unreceipt.com",
  ].join("\n\n");

  return new Response(body + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
