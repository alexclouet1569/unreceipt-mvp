import Image from "next/image";
import { Globe, Menu } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import { LOCALES, LOCALE_HOME, LOCALE_NAME, type Locale } from "@/lib/locale";
import { MARKETING_PAGES, pagePath, type MarketingPageId } from "@/lib/marketing-pages";
import { SHOW_PRICES } from "@/lib/pricing-visibility";
import { cn } from "@/lib/utils";
import { SITE_COPY } from "./_site-copy";
import { LightOnly } from "./_light-only";


// Same look as the shared Button, without importing that client module
// into a server component.
const BTN =
  "inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";
/**
 * Header and footer for the marketing sub-pages (audience pages, guides).
 * No hooks: the mobile menu is a native <details>, so the links are plain
 * HTML that crawlers follow without running JavaScript. The footer is
 * shared with the landing page so every page links to every other one.
 */

/** The same page in another language when it exists, else that language's home. */
function languageHref(page: MarketingPageId, locale: Locale): string {
  const p = MARKETING_PAGES[page];
  return (p.translated && p.paths[locale]) || LOCALE_HOME[locale];
}

export function SiteHeader({
  locale,
  page,
  pilotMode,
}: {
  locale: Locale;
  page: MarketingPageId;
  pilotMode: boolean;
}) {
  const t = SITE_COPY[locale].nav;
  const home = LOCALE_HOME[locale];
  const cta = pilotMode ? t.ctaPilot : t.ctaPaid;
  const links = [
    { label: t.how, href: `${home}#how` },
    ...(SHOW_PRICES ? [{ label: t.pricing, href: `${home}#pricing` }] : []),
    { label: t.accountants, href: pagePath("accountants", locale) },
    { label: t.freelancers, href: pagePath("freelancers", locale) },
  ];
  const others = LOCALES.filter((l) => l !== locale);

  return (
    <header className="sticky top-0 z-50 bg-[#FAFAF7] border-b border-[#E8E5DD]">
      {/* The marketing site has no dark design: keep it light on shared hosts. */}
      <LightOnly />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        <a href={home} aria-label={`UnReceipt — ${t.home}`} className="py-1">
          <Wordmark variant="horizontal" on="light" className="text-[22px] sm:text-[24px]" />
        </a>
        <nav aria-label="Main" className="hidden lg:flex items-center gap-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium whitespace-nowrap text-[#303568]/70 hover:text-[#303568]"
            >
              {link.label}
            </a>
          ))}
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#303568]/70">
            <Globe className="w-4 h-4" aria-hidden="true" />
            {others.map((l) => (
              <a
                key={l}
                href={languageHref(page, l)}
                hrefLang={l}
                lang={l}
                aria-label={LOCALE_NAME[l].label}
                className="hover:text-[#303568] px-0.5"
              >
                {LOCALE_NAME[l].short}
              </a>
            ))}
          </span>
          <a
            href={appUrl("/app/login")}
            className="text-sm font-medium whitespace-nowrap text-[#303568]/70 hover:text-[#303568]"
          >
            {t.signIn}
          </a>
          <a
            href={appUrl(SIGNUP_PATH)}
            className={cn(BTN, "bg-[#27BE7B] text-white hover:bg-[#1F9D63] font-semibold rounded-full px-6 h-10")}
          >
            {cta}
          </a>
        </nav>
        <details className="lg:hidden relative group">
          <summary
            className="list-none cursor-pointer p-3 -mr-2 text-[#303568] [&::-webkit-details-marker]:hidden"
            aria-label={t.menu}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-[#E8E5DD] rounded-2xl p-2 flex flex-col">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-base text-[#303568] font-medium min-h-[44px] flex items-center px-3"
              >
                {link.label}
              </a>
            ))}
            <a
              href={appUrl("/app/login")}
              className="text-base text-[#303568] font-medium min-h-[44px] flex items-center px-3 border-t border-[#E8E5DD]"
            >
              {t.signIn}
            </a>
            {others.map((l) => (
              <a
                key={l}
                href={languageHref(page, l)}
                hrefLang={l}
                lang={l}
                className="text-base text-[#303568] font-medium min-h-[44px] flex items-center gap-2 px-3"
              >
                <Globe className="w-4 h-4" aria-hidden="true" />
                {LOCALE_NAME[l].label}
              </a>
            ))}
            <a
              href={appUrl(SIGNUP_PATH)}
              className={cn(BTN, "mt-2 w-full bg-[#27BE7B] text-white hover:bg-[#1F9D63] font-semibold rounded-full h-11")}
            >
              {cta}
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = SITE_COPY[locale];
  const home = LOCALE_HOME[locale];
  const others = LOCALES.filter((l) => l !== locale);
  const guidePaper = MARKETING_PAGES.guidePaper.paths[locale];
  const columns: { title: string; links: { label: string; href: string; lang?: Locale }[] }[] = [
    {
      title: t.footer.product,
      links: [
        { label: t.nav.how, href: `${home}#how` },
        ...(SHOW_PRICES ? [{ label: t.nav.pricing, href: `${home}#pricing` }] : []),
        { label: t.footer.demo, href: appUrl("/demo") },
        { label: t.footer.faq, href: `${home}#faq` },
      ],
    },
    {
      title: t.footer.whoFor,
      links: [
        { label: t.footer.smallBusiness, href: home },
        { label: t.nav.freelancers, href: pagePath("freelancers", locale) },
        { label: t.nav.accountants, href: pagePath("accountants", locale) },
      ],
    },
    {
      title: t.footer.guides,
      links: [
        { label: t.footer.guideRetention, href: pagePath("guideRetention", locale) },
        ...(guidePaper && t.footer.guidePaper
          ? [{ label: t.footer.guidePaper, href: guidePaper }]
          : []),
      ],
    },
    {
      title: t.footer.company,
      links: [
        { label: t.footer.about, href: pagePath("about", locale) },
        { label: t.footer.contact, href: "mailto:support@unreceipt.com" },
        { label: t.footer.privacy, href: "/privacy" },
        ...others.map((l) => ({ label: LOCALE_NAME[l].label, href: LOCALE_HOME[l], lang: l })),
      ],
    },
  ];

  return (
    <footer className="bg-[#252850] py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <Image
              src="/logo-light.png"
              alt="UnReceipt"
              width={180}
              height={50}
              className="h-10 w-auto mb-4"
            />
            <p className="text-sm text-white/50 max-w-xs">{t.footer.tagline}</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">
                {col.title}
              </p>
              <ul className="flex flex-col">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      {...(link.lang ? { hrefLang: link.lang, lang: link.lang } : {})}
                      className="block text-sm text-white/50 hover:text-white transition-colors py-2"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            &copy; 2026 UnReceipt. {t.footer.rights}
          </p>
          <p className="text-xs text-white/40">{t.footer.made}</p>
        </div>
      </div>
    </footer>
  );
}
