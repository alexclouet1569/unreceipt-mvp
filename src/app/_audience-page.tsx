import {
  ArrowRight,
  BookOpen,
  Calculator,
  Camera,
  CheckCircle2,
  Circle,
  ChevronDown,
  Clock,
  Download,
  Globe,
  Layers,
  Mail,
  ReceiptText,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import type { Locale } from "@/lib/locale";
import { pagePath } from "@/lib/marketing-pages";
import { PLANS, planPriceLabel } from "@/lib/plans";
import { audienceJsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { AUDIENCE_COPY, type AudienceId, type Cta, type IconName } from "./_audience-copy";
import { HtmlLang } from "./_html-lang";
import { fill } from "./_landing-copy";
import { SITE_COPY } from "./_site-copy";
import { SiteFooter, SiteHeader } from "./_site-chrome";


// Same look as the shared Button, without importing that client module
// into a server component.
const BTN =
  "inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";
/**
 * One audience page (accounting firms or freelancers) in one language.
 * Server component: every word, link and FAQ answer is in the HTML.
 * Same visual language as the landing page (green hero, cream body,
 * navy ink); out of DESIGN.md scope like the landing.
 */

const ICONS: Record<IconName, LucideIcon> = {
  mail: Mail,
  camera: Camera,
  receipt: ReceiptText,
  users: Users,
  layers: Layers,
  check: CheckCircle2,
  download: Download,
  globe: Globe,
  calculator: Calculator,
  shield: ShieldCheck,
  book: BookOpen,
  clock: Clock,
};

export function AudiencePage({
  audience,
  locale,
  pilotMode,
}: {
  audience: AudienceId;
  locale: Locale;
  pilotMode: boolean;
}) {
  const t = AUDIENCE_COPY[audience][locale];
  const nav = SITE_COPY[locale].nav;
  const signupLabel = pilotMode ? nav.ctaPilot : nav.ctaPaid;
  const price = planPriceLabel(PLANS[0], locale);

  const href = (cta: Cta): string => {
    switch (cta) {
      case "signup":
        return appUrl(SIGNUP_PATH);
      case "demoCompany":
        return appUrl("/demo/company?step=1");
      case "demoAccountant":
        return appUrl("/demo/accountant?step=1");
      case "contactFirm":
        return `mailto:support@unreceipt.com?subject=${encodeURIComponent(t.contactSubject)}`;
    }
  };
  const label = (cta: Cta, own?: string) => (cta === "signup" ? signupLabel : own ?? signupLabel);

  const jsonLd = audienceJsonLd({
    page: audience,
    locale,
    name: t.meta.title,
    description: t.meta.description,
    breadcrumb: t.breadcrumb,
    audienceType: t.audienceType,
    faq: t.faq,
  });

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {locale !== "en" ? <HtmlLang lang={locale} /> : null}
      <SiteHeader locale={locale} page={audience} pilotMode={pilotMode} />

      <main>
        {/* ─── HERO ─── */}
        <section className="bg-[#27BE7B] px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.15fr_1fr] gap-12 items-center">
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
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={href(t.hero.primary)}
                  className={cn(BTN, "bg-white text-[#1F9D63] hover:bg-white/90 rounded-full px-7 text-base font-semibold h-12")}
                >
                  {label(t.hero.primary, t.hero.primaryLabel)}
                  <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                </a>
                <a
                  href={href(t.hero.secondary)}
                  className={cn(BTN, "border-2 border-white text-white hover:bg-white hover:text-[#1F9D63] rounded-full px-7 text-base font-semibold bg-transparent h-12")}
                >
                  {t.hero.secondaryLabel}
                </a>
              </div>
              <p className="text-white/85 text-sm mt-4">
                {fill(pilotMode ? t.hero.notePilot : t.hero.notePaid, { price })}
              </p>
            </div>

            {/* Sample panel: what the screen looks like, with made-up data. */}
            <figure className="bg-white rounded-3xl border border-[#E8E5DD] p-5 sm:p-6 max-w-md w-full lg:justify-self-end">
              <p className="text-xs font-bold text-[#303568]/60 uppercase tracking-wider mb-4">{t.panel.title}</p>
              <ul className="divide-y divide-[#E8E5DD]">
                {t.panel.rows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm font-semibold text-[#303568]">{row.label}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap",
                        row.done ? "text-[#1F9D63]" : "text-[#B4690E]"
                      )}
                    >
                      {row.done ? (
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Circle className="w-4 h-4" aria-hidden="true" />
                      )}
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
              <figcaption className="text-xs text-[#303568]/50 mt-3">{t.panel.caption}</figcaption>
            </figure>
          </div>
        </section>

        {/* ─── BEFORE / AFTER ─── */}
        <section className="px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-sm font-semibold text-[#1F9D63] uppercase tracking-widest mb-3">
              {t.compare.eyebrow}
            </p>
            <h2 className="text-center text-3xl sm:text-4xl font-extrabold text-[#303568] mb-10">
              {t.compare.title}
            </h2>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="rounded-3xl bg-white border border-[#E8E5DD] p-7">
                <h3 className="font-bold mb-5 text-[#B42318] text-sm uppercase tracking-widest">{t.compare.oldTitle}</h3>
                <ul className="space-y-3 text-sm">
                  {t.compare.old.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[#303568]/75">
                      <X className="w-4 h-4 mt-0.5 text-[#B42318] shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl bg-[#303568] p-7">
                <h3 className="font-bold mb-5 text-white text-sm uppercase tracking-widest">{t.compare.newTitle}</h3>
                <ul className="space-y-3 text-sm">
                  {t.compare.new.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-white">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-[#27BE7B] shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ─── STEPS ─── */}
        <section id="how" className="px-4 sm:px-6 py-16 sm:py-20 bg-white border-y border-[#E8E5DD]">
          <div className="max-w-5xl mx-auto">
            <p className="text-center text-sm font-semibold text-[#1F9D63] uppercase tracking-widest mb-3">
              {t.steps.eyebrow}
            </p>
            <h2 className="text-center text-3xl sm:text-4xl font-extrabold text-[#303568] mb-12">{t.steps.title}</h2>
            <ol className="grid md:grid-cols-3 gap-8">
              {t.steps.items.map((item, i) => (
                <li key={item.title}>
                  <p className="text-xs font-bold text-[#1F9D63] mb-2 tracking-widest">
                    {t.steps.step} 0{i + 1}
                  </p>
                  <h3 className="font-bold text-[#303568] text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-[#303568]/70 leading-relaxed">{item.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section className="px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <p className="text-center text-sm font-semibold text-[#1F9D63] uppercase tracking-widest mb-3">
              {t.features.eyebrow}
            </p>
            <h2 className="text-center text-3xl sm:text-4xl font-extrabold text-[#303568] mb-12">{t.features.title}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {t.features.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <div key={item.title} className="rounded-2xl bg-white border border-[#E8E5DD] p-6">
                    <div className="w-11 h-11 rounded-xl bg-[#27BE7B]/10 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-[#1F9D63]" aria-hidden="true" />
                    </div>
                    <h3 className="font-bold text-[#303568] mb-2">{item.title}</h3>
                    <p className="text-sm text-[#303568]/70 leading-relaxed">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq" className="px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-center text-3xl sm:text-4xl font-extrabold text-[#303568] mb-10">{t.faqTitle}</h2>
            <div className="space-y-3">
              {t.faq.map((item) => (
                <details
                  key={item.q}
                  className="group bg-white border border-[#E8E5DD] rounded-2xl px-5 sm:px-6 open:pb-5"
                >
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none py-4 sm:py-5 font-bold text-[#303568] [&::-webkit-details-marker]:hidden">
                    <h3 className="text-base sm:text-lg">{item.q}</h3>
                    <ChevronDown
                      className="w-5 h-5 shrink-0 text-[#1F9D63] transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="text-sm sm:text-base leading-relaxed text-[#303568]/75">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── RELATED ─── */}
        <section className="px-4 sm:px-6 pb-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-lg font-bold text-[#303568] mb-4">{t.related.title}</h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {t.related.links.map((link) => (
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
          </div>
        </section>

        {/* ─── ENDING ─── */}
        <section className="bg-[#303568] px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-4 text-white">{t.ending.title}</h2>
            <p className="text-white/75 mb-8">{t.ending.lead}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={href(t.ending.primary)}
                className={cn(BTN, "bg-[#27BE7B] text-white hover:bg-[#1F9D63] rounded-full px-7 text-base font-semibold h-12")}
              >
                {label(t.ending.primary, t.ending.primaryLabel)}
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </a>
              <a
                href={href(t.ending.secondary)}
                className={cn(BTN, "border-2 border-white/70 text-white hover:bg-white hover:text-[#303568] rounded-full px-7 text-base font-semibold bg-transparent h-12")}
              >
                {t.ending.secondaryLabel}
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
