import { ArrowRight, Check, X } from "lucide-react";
import { getAbout, ABOUT_AS_OF } from "@/lib/about";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import type { Locale } from "@/lib/locale";
import { pagePath } from "@/lib/marketing-pages";
import { aboutJsonLd, jsonLdHtml } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { HtmlLang } from "./_html-lang";
import { SITE_COPY } from "./_site-copy";
import { SiteFooter, SiteHeader } from "./_site-chrome";

// Same look as the shared Button, without importing that client module
// into a server component.
const BTN =
  "inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";

const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" };

/**
 * "About UnReceipt": the fact sheet. A definition first, then the facts as
 * a definition list (label → value), who it fits, who it doesn't, and what
 * it doesn't do. Written to be quoted as-is by search engines and AI
 * assistants; content in src/lib/about.ts.
 */
export function AboutPage({ locale, pilotMode }: { locale: Locale; pilotMode: boolean }) {
  const a = getAbout(locale, pilotMode);
  const nav = SITE_COPY[locale].nav;
  const asOf = new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ABOUT_AS_OF}T00:00:00Z`));
  const jsonLd = aboutJsonLd({
    locale,
    name: a.meta.title,
    description: a.meta.description,
    breadcrumb: a.breadcrumb,
    summary: a.summary,
    asOf: ABOUT_AS_OF,
    facts: a.facts,
  });

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      {locale !== "en" ? <HtmlLang lang={locale} /> : null}
      <SiteHeader locale={locale} page="about" pilotMode={pilotMode} />

      <main className="px-4 sm:px-6 py-10 sm:py-14">
        <article className="max-w-2xl mx-auto">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[#303568]/60">
            <a href={pagePath("home", locale)} className="hover:text-[#303568] hover:underline underline-offset-2">
              UnReceipt
            </a>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{a.breadcrumb}</span>
          </nav>

          <p className="text-sm font-semibold text-[#1F9D63] uppercase tracking-widest mb-3">{a.eyebrow}</p>
          <h1 className="text-3xl sm:text-[2.6rem] font-extrabold tracking-tight leading-[1.12] text-[#303568] mb-4">
            {a.title}
          </h1>
          <p className="text-sm text-[#303568]/60 mb-8">
            {a.asOfLabel} <time dateTime={ABOUT_AS_OF}>{asOf}</time>
          </p>

          <p className="text-lg leading-relaxed text-[#303568] mb-10">{a.summary}</p>

          <section className="mb-10">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#303568] mb-4">{a.factsTitle}</h2>
            <dl className="bg-white border border-[#E8E5DD] rounded-2xl divide-y divide-[#E8E5DD]">
              {a.facts.map((f) => (
                <div key={f.label} className="grid sm:grid-cols-[11rem_1fr] gap-1 sm:gap-4 px-5 py-4">
                  <dt className="font-bold text-[#303568]">{f.label}</dt>
                  <dd className="text-[#303568]/85 leading-relaxed">{f.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid sm:grid-cols-2 gap-5 mb-10">
            <section className="bg-white border border-[#E8E5DD] rounded-2xl p-5">
              <h2 className="font-extrabold text-[#303568] mb-3">{a.fitTitle}</h2>
              <ul className="space-y-2.5 text-sm leading-relaxed text-[#303568]/85">
                {a.fit.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check className="w-4 h-4 mt-0.5 text-[#1F9D63] shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section className="bg-white border border-[#E8E5DD] rounded-2xl p-5">
              <h2 className="font-extrabold text-[#303568] mb-3">{a.notFitTitle}</h2>
              <ul className="space-y-2.5 text-sm leading-relaxed text-[#303568]/85">
                {a.notFit.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <X className="w-4 h-4 mt-0.5 text-[#B42318] shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mb-10">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#303568] mb-3">{a.limitsTitle}</h2>
            <ul className="list-disc pl-6 space-y-2 text-base leading-relaxed text-[#303568]/85">
              {a.limits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl bg-[#303568] p-6 sm:p-8">
            <h2 className="text-xl font-extrabold text-white mb-2">{a.contactTitle}</h2>
            <p className="text-white/75 mb-6">{a.contact}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={appUrl(SIGNUP_PATH)}
                className={cn(BTN, "bg-[#27BE7B] text-white hover:bg-[#1F9D63] rounded-full px-6 font-semibold h-11")}
              >
                {pilotMode ? nav.ctaPilot : nav.ctaPaid}
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </a>
              <a
                href={pagePath("accountants", locale)}
                className={cn(
                  BTN,
                  "border-2 border-white/70 text-white hover:bg-white hover:text-[#303568] rounded-full px-6 font-semibold bg-transparent h-11"
                )}
              >
                {nav.accountants}
              </a>
            </div>
          </section>
        </article>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
