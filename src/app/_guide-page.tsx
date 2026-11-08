import { ArrowRight } from "lucide-react";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import { getGuide, type GuidePageId } from "@/lib/guides";
import type { Locale } from "@/lib/locale";
import { pagePath } from "@/lib/marketing-pages";
import { guideJsonLd, jsonLdHtml } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { HtmlLang } from "./_html-lang";
import { SITE_COPY } from "./_site-copy";
import { SiteFooter, SiteHeader } from "./_site-chrome";


// Same look as the shared Button, without importing that client module
// into a server component.
const BTN =
  "inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";
/**
 * A guide article. Server component: the short answer comes first (what
 * search engines lift into a featured snippet and AI assistants quote),
 * then the detail, the sources with links and the review date.
 */

const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" };

function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function GuidePage({
  page,
  locale,
  pilotMode,
}: {
  page: GuidePageId;
  locale: Locale;
  pilotMode: boolean;
}) {
  const g = getGuide(page, locale);
  const nav = SITE_COPY[locale].nav;
  const jsonLd = guideJsonLd({
    page,
    locale,
    headline: g.title,
    description: g.description,
    breadcrumb: g.breadcrumb,
    published: g.published,
    updated: g.updated,
    faq: g.faq,
  });

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      {locale !== "en" ? <HtmlLang lang={locale} /> : null}
      <SiteHeader locale={locale} page={page} pilotMode={pilotMode} />

      <main className="px-4 sm:px-6 py-10 sm:py-14">
        <article className="max-w-2xl mx-auto">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[#303568]/60">
            <a href={pagePath("home", locale)} className="hover:text-[#303568] hover:underline underline-offset-2">
              UnReceipt
            </a>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{g.breadcrumb}</span>
          </nav>

          <p className="text-sm font-semibold text-[#1F9D63] uppercase tracking-widest mb-3">{g.eyebrow}</p>
          <h1 className="text-3xl sm:text-[2.6rem] font-extrabold tracking-tight leading-[1.12] text-[#303568] mb-4">
            {g.title}
          </h1>
          <p className="text-sm text-[#303568]/60 mb-8">
            {g.updatedLabel}{" "}
            <time dateTime={g.updated}>{formatDate(g.updated, locale)}</time>
          </p>

          <div className="rounded-2xl bg-[#ECF7E7] border border-[#27BE7B]/25 p-5 sm:p-6 mb-10">
            <p className="text-xs font-bold text-[#1F9D63] uppercase tracking-widest mb-2">{g.answerLabel}</p>
            <p className="text-base sm:text-lg leading-relaxed text-[#303568]">{g.answer}</p>
          </div>

          {g.sections.map((section) => (
            <section key={section.heading} className="mb-9">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#303568] mb-3">{section.heading}</h2>
              {section.body.map((p) => (
                <p key={p.slice(0, 40)} className="text-base leading-relaxed text-[#303568]/85 mb-3">
                  {p}
                </p>
              ))}
              {section.list ? (
                <ul className="list-disc pl-6 space-y-2 text-base leading-relaxed text-[#303568]/85">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <section className="mb-10">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#303568] mb-4">{g.faqTitle}</h2>
            <dl className="space-y-5">
              {g.faq.map((item) => (
                <div key={item.q}>
                  <dt className="font-bold text-[#303568] mb-1">{item.q}</dt>
                  <dd className="text-base leading-relaxed text-[#303568]/85">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <aside className="rounded-3xl bg-[#303568] p-6 sm:p-8 mb-10">
            <p className="text-xl font-extrabold text-white mb-2">{g.cta.title}</p>
            <p className="text-white/75 mb-6">{g.cta.lead}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={appUrl(SIGNUP_PATH)}
                className={cn(BTN, "bg-[#27BE7B] text-white hover:bg-[#1F9D63] rounded-full px-6 font-semibold h-11")}
              >
                {pilotMode ? nav.ctaPilot : nav.ctaPaid}
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </a>
              <a
                href={appUrl("/demo")}
                className={cn(BTN, "border-2 border-white/70 text-white hover:bg-white hover:text-[#303568] rounded-full px-6 font-semibold bg-transparent h-11")}
              >
                {g.cta.secondaryLabel}
              </a>
            </div>
          </aside>

          <section className="mb-10">
            <h2 className="text-lg font-bold text-[#303568] mb-3">{g.sourcesTitle}</h2>
            <ul className="space-y-2 text-sm">
              {g.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    rel="noopener"
                    className="text-[#1F6F4A] underline underline-offset-2 hover:text-[#303568] break-words"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[#303568]/60 mt-5">{g.disclaimer}</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#303568] mb-3">{g.relatedTitle}</h2>
            <ul className="grid gap-3">
              {g.related.map((link) => (
                <li key={link.page}>
                  <a
                    href={pagePath(link.page, locale)}
                    className="flex items-center justify-between gap-3 bg-white border border-[#E8E5DD] rounded-2xl px-5 py-4 text-sm font-semibold text-[#303568] hover:border-[#27BE7B]"
                  >
                    {link.label}
                    <ArrowRight className="w-4 h-4 shrink-0 text-[#1F9D63]" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
