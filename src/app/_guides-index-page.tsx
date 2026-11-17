import { ArrowRight } from "lucide-react";
import { GUIDES_INDEX, formatGuideDate, guidesFor } from "@/lib/guides";
import type { Locale } from "@/lib/locale";
import { pagePath } from "@/lib/marketing-pages";
import { guidesIndexJsonLd, jsonLdHtml } from "@/lib/seo";
import { SiteFooter, SiteHeader } from "./_site-chrome";

/**
 * The guides index of one language (`/guides`, `/sv/guider`, `/fr/guides`).
 * Server component. Lists the guides written for that language's country,
 * most recently reviewed first; guides are registered in src/lib/guides.ts.
 */
export function GuidesIndexPage({ locale, pilotMode }: { locale: Locale; pilotMode: boolean }) {
  const t = GUIDES_INDEX[locale];
  const guides = guidesFor(locale);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(guidesIndexJsonLd(locale)) }}
      />
      <SiteHeader locale={locale} page="guides" pilotMode={pilotMode} />

      <main className="px-4 sm:px-6 py-10 sm:py-14">
        <div className="max-w-2xl mx-auto">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[#303568]/60">
            <a href={pagePath("home", locale)} className="hover:text-[#303568] hover:underline underline-offset-2">
              UnReceipt
            </a>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{t.breadcrumb}</span>
          </nav>

          <p className="text-sm font-semibold text-[#1F9D63] uppercase tracking-widest mb-3">{t.eyebrow}</p>
          <h1 className="text-3xl sm:text-[2.6rem] font-extrabold tracking-tight leading-[1.12] text-[#303568] mb-4">
            {t.title}
          </h1>
          <p className="text-base sm:text-lg leading-relaxed text-[#303568]/80 mb-10">{t.lead}</p>

          <ul className="grid gap-4">
            {guides.map((g) => (
              <li key={g.page}>
                <a
                  href={pagePath(g.page, locale)}
                  className="group block bg-white border border-[#E8E5DD] rounded-2xl p-5 sm:p-6 hover:border-[#27BE7B]"
                >
                  <h2 className="text-lg sm:text-xl font-extrabold text-[#303568] mb-2">{g.title}</h2>
                  <p className="text-base leading-relaxed text-[#303568]/80 mb-3">{g.description}</p>
                  <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-[#303568]/60">
                      {t.updatedLabel} <time dateTime={g.updated}>{formatGuideDate(g.updated, locale)}</time>
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[#1F6F4A] group-hover:text-[#303568]">
                      {t.readLabel}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
