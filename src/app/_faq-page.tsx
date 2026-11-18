import { ArrowRight, ChevronDown } from "lucide-react";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import { FAQ_PAGE, getFaq } from "@/lib/faq";
import type { Locale } from "@/lib/locale";
import { demoRequestLang, demoRequestPath, pagePath } from "@/lib/marketing-pages";
import { faqPageJsonLd, jsonLdHtml } from "@/lib/seo";
import { trackedLink } from "@/lib/tracking/events";
import { cn } from "@/lib/utils";
import { SITE_COPY } from "./_site-copy";
import { SiteFooter, SiteHeader } from "./_site-chrome";

// Same look as the shared Button, without importing that client module
// into a server component.
const BTN =
  "inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";

/**
 * The FAQ page of one language (`/faq`, `/sv/vanliga-fragor`, `/fr/faq`).
 * Server component: every answer is in the HTML (native <details>), so
 * search engines and AI assistants read it without running JavaScript.
 * Questions and answers in src/lib/faq.ts, mirrored in the FAQPage JSON-LD.
 */
export function FaqPage({ locale, pilotMode }: { locale: Locale; pilotMode: boolean }) {
  const t = FAQ_PAGE[locale];
  const nav = SITE_COPY[locale].nav;
  const faq = getFaq(pilotMode, locale);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqPageJsonLd(pilotMode, locale)) }}
      />
      <SiteHeader locale={locale} page="faq" pilotMode={pilotMode} />

      <main className="px-4 sm:px-6 py-10 sm:py-14">
        <div className="max-w-3xl mx-auto">
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

          <div className="space-y-3 mb-12">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group bg-white border border-[#E8E5DD] rounded-2xl px-5 sm:px-6 open:pb-5"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none py-4 sm:py-5 font-bold text-[#303568] [&::-webkit-details-marker]:hidden">
                  <h2 className="text-base sm:text-lg">{item.q}</h2>
                  <ChevronDown
                    className="w-5 h-5 shrink-0 text-[#1F9D63] transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="text-sm sm:text-base leading-relaxed text-[#303568]/80">{item.a}</p>
              </details>
            ))}
          </div>

          <section className="rounded-3xl bg-[#303568] p-6 sm:p-8">
            <h2 className="text-xl font-extrabold text-white mb-2">{t.contactTitle}</h2>
            <p className="text-white/75 mb-6">{t.contact}</p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <a
                href={demoRequestPath(locale)}
                {...(demoRequestLang(locale) !== locale ? { hrefLang: demoRequestLang(locale) } : {})}
                {...trackedLink("cta_demo_page")}
                className={cn(BTN, "bg-white text-[#303568] hover:bg-white/90 rounded-full px-6 font-semibold h-11 focus-visible:outline-white")}
              >
                {nav.bookDemo}
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </a>
              <a
                href={appUrl(SIGNUP_PATH)}
                {...trackedLink("cta_signup", { attribution: true })}
                className={cn(BTN, "bg-[#27BE7B] text-white hover:bg-[#1F9D63] rounded-full px-6 font-semibold h-11 focus-visible:outline-white")}
              >
                {pilotMode ? nav.ctaPilot : nav.ctaPaid}
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
