import { ArrowRight, Check } from "lucide-react";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import type { DemoRequestLocale } from "@/lib/demo-request";
import { pagePath } from "@/lib/marketing-pages";
import { demoPageJsonLd, jsonLdHtml } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { DEMO_REQUEST_COPY } from "./_demo-request-copy";
import { DemoRequestForm } from "./_demo-request-form";
import { HtmlLang } from "./_html-lang";
import { SiteFooter, SiteHeader } from "./_site-chrome";
import { trackedLink } from "@/lib/tracking/events";

// Same look as the shared Button, without importing that client module
// into a server component.
const BTN =
  "inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";

/**
 * The demo request page (/book-demo, /sv/boka-demo). Server component: the
 * copy is in the HTML, only the form is a client component. Same visual
 * language as the audience pages; out of DESIGN.md scope like them.
 */
export function DemoRequestPage({
  locale,
  pilotMode,
}: {
  locale: DemoRequestLocale;
  pilotMode: boolean;
}) {
  const t = DEMO_REQUEST_COPY[locale];
  const jsonLd = demoPageJsonLd({
    locale,
    name: t.meta.title,
    description: t.meta.description,
    breadcrumb: t.breadcrumb,
  });
  // Cal.com (or any https booking page); without it the thank-you state
  // only promises an email. Set in Vercel, inlined at build like every
  // NEXT_PUBLIC_ variable.
  const bookingUrl = process.env.NEXT_PUBLIC_DEMO_BOOKING_URL ?? null;

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      {locale !== "en" ? <HtmlLang lang={locale} /> : null}
      <SiteHeader locale={locale} page="bookDemo" pilotMode={pilotMode} />

      <main>
        <section className="bg-[#27BE7B] px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-20">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_minmax(0,520px)] gap-10 lg:gap-14 items-start">
            <div>
              <nav aria-label="Breadcrumb" className="mb-6 text-sm text-white/80">
                <a href={pagePath("home", locale)} className="hover:text-white underline-offset-2 hover:underline">
                  UnReceipt
                </a>
                <span aria-hidden="true"> / </span>
                <span aria-current="page">{t.breadcrumb}</span>
              </nav>
              <p className="inline-flex bg-white/15 rounded-full px-4 py-1.5 mb-6 text-white/90 text-xs font-semibold tracking-wide uppercase">
                {t.hero.eyebrow}
              </p>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.08] mb-6 text-white">
                {t.hero.title}
                <br />
                <span className="text-[#303568]">{t.hero.accent}</span>
              </h1>
              <p className="text-white/90 text-lg leading-relaxed max-w-xl mb-8">{t.hero.lead}</p>
              <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-4">{t.steps.title}</h2>
              <ol className="space-y-3 max-w-xl">
                {t.steps.items.map((item, i) => (
                  <li key={item} className="flex items-start gap-3 text-white">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-white text-[#1A7F52] text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-white rounded-3xl border border-[#E8E5DD] p-5 sm:p-7 w-full">
              <DemoRequestForm locale={locale} bookingUrl={bookingUrl} />
            </div>
          </div>
        </section>

        <section className="px-4 sm:px-6 py-14 sm:py-20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#303568] mb-8">{t.notes.title}</h2>
            <div className="grid md:grid-cols-2 gap-5 mb-5">
              {t.notes.items.map((item) => (
                <div key={item.title} className="rounded-2xl bg-white border border-[#E8E5DD] p-6">
                  <h3 className="flex items-start gap-2 font-bold text-[#303568] mb-2">
                    <Check className="w-5 h-5 mt-0.5 shrink-0 text-[#1F9D63]" aria-hidden="true" />
                    {item.title}
                  </h3>
                  <p className="text-sm text-[#303568]/70 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-[#303568] p-6 sm:p-7">
              <h3 className="font-bold text-white mb-2">{t.notes.selfServe.title}</h3>
              <p className="text-sm text-white/75 mb-5">{t.notes.selfServe.desc}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={appUrl("/demo/company?step=1")}
                  {...trackedLink("demo_tour_start", { attribution: true })}
                  className={cn(BTN, "bg-[#1A7F52] text-white hover:bg-[#176E47] rounded-full px-6 font-semibold h-11 focus-visible:outline-white")}
                >
                  {t.notes.selfServe.tour}
                  <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                </a>
                <a
                  href={appUrl(SIGNUP_PATH)}
                  {...trackedLink("cta_signup", { attribution: true })}
                  className={cn(
                    BTN,
                    "border-2 border-white/70 text-white hover:bg-white hover:text-[#303568] rounded-full px-6 font-semibold bg-transparent h-11 focus-visible:outline-white"
                  )}
                >
                  {pilotMode ? t.notes.selfServe.signupPilot : t.notes.selfServe.signupPaid}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
