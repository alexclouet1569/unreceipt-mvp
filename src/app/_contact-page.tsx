import { ArrowRight } from "lucide-react";
import type { DemoRequestLocale } from "@/lib/demo-request";
import { demoRequestPath, pagePath } from "@/lib/marketing-pages";
import { demoPageJsonLd, jsonLdHtml } from "@/lib/seo";
import { trackedLink } from "@/lib/tracking/events";
import { CONTACT_COPY } from "./_contact-copy";
import { ContactForm } from "./_contact-form";
import { SiteFooter, SiteHeader } from "./_site-chrome";

/**
 * The contact page (/contact, /sv/kontakt, /fr/contact), where the footer's
 * "Contact" leads: a short form (name, email, reason, message) instead of an
 * email link, which does nothing for webmail and phone users. Server
 * component: the copy is in the HTML, only the form is a client component.
 * Same visual language as the demo request page; out of DESIGN.md scope.
 */
export function ContactPage({ locale, pilotMode }: { locale: DemoRequestLocale; pilotMode: boolean }) {
  const t = CONTACT_COPY[locale];
  const jsonLd = demoPageJsonLd({
    page: "contact",
    locale,
    name: t.meta.title,
    description: t.meta.description,
    breadcrumb: t.breadcrumb,
  });

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <SiteHeader locale={locale} page="contact" pilotMode={pilotMode} />

      <main>
        <section className="bg-[#27BE7B] px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-20">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_minmax(0,560px)] gap-10 lg:gap-14 items-start">
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
              </h1>
              <p className="text-white/90 text-lg leading-relaxed max-w-xl mb-8">{t.hero.lead}</p>
              <p className="text-white/90">
                {t.demo.lead}{" "}
                <a
                  href={demoRequestPath(locale)}
                  {...trackedLink("cta_demo_page")}
                  className="inline-flex items-center gap-1 font-semibold text-white underline underline-offset-2 hover:text-[#303568] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {t.demo.link}
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-[#E8E5DD] p-5 sm:p-7 w-full">
              <ContactForm locale={locale} copy={{ ...t.form, sent: t.sent }} />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
