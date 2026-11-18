import Image from "next/image";
import { Building2, Calculator, Check, ChevronDown, Globe, Menu, UserRound } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import { trackedLink, type TrackedLinkAttrs } from "@/lib/tracking/events";
import { LOCALES, LOCALE_HOME, LOCALE_NAME, type Locale } from "@/lib/locale";
import {
  MARKETING_PAGES,
  demoRequestLang,
  demoRequestPath,
  pagePath,
  type MarketingPageId,
} from "@/lib/marketing-pages";
import { SHOW_PRICES } from "@/lib/pricing-visibility";
import { SUPPORT_MAILTO } from "@/lib/support-contact";
import { cn } from "@/lib/utils";
import { SITE_COPY } from "./_site-copy";
import { HeaderShell } from "./_header-shell";


// Same look as the shared Button, without importing that client module
// into a server component.
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]";
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

/** The pages the audience tabs point at, in their order. */
const AUDIENCE_PAGES = ["smallBusiness", "freelancers", "accountants"] as const;
export type AudiencePageId = (typeof AUDIENCE_PAGES)[number];
const AUDIENCE_ICONS = [Building2, UserRound, Calculator] as const;

/**
 * The marketing header: the wordmark on the left, a few links in the
 * middle, then the language menu, Sign in and the one call to action.
 * Below 1024px the links, languages and sign in go into a menu.
 * The bar is cream, as on the original site; it is fixed, and a spacer
 * keeps the page's content below it.
 */
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
  const audiences = SITE_COPY[locale].audiences;
  const home = LOCALE_HOME[locale];
  const cta = pilotMode ? t.ctaPilot : t.ctaPaid;
  const links = [
    { label: t.how, href: `${home}#how` },
    ...(SHOW_PRICES ? [{ label: t.pricing, href: `${home}#pricing` }] : []),
    { label: t.faq, href: `${home}#faq` },
    { label: t.about, href: pagePath("about", locale) },
  ];
  const demo = { href: demoRequestPath(locale), lang: demoRequestLang(locale) };
  const demoLangProps = demo.lang !== locale ? { hrefLang: demo.lang } : {};

  const ink = "text-[#303568]/75 hover:text-[#303568]";
  const quiet = "border border-[#303568]/20 text-[#303568] hover:bg-[#303568]/5";
  const filled = "bg-[#303568] text-white hover:bg-[#252850]";

  return (
    <>
      <HeaderShell>
        <div className="px-4 sm:px-6">
        <div className="max-w-6xl mx-auto h-[72px] flex items-center gap-4 lg:gap-10">
          <a href={home} aria-label={`UnReceipt — ${t.home}`} className={cn("relative py-1 shrink-0", FOCUS)}>
            <Wordmark variant="horizontal" on="light" className="text-[22px] sm:text-[24px]" />
          </a>

          <nav aria-label="Main" className="hidden lg:flex items-center gap-7 text-[15px] font-medium">
            {links.map((link) => (
              <a key={link.href} href={link.href} className={cn("whitespace-nowrap transition-colors py-3 -my-3", FOCUS, ink)}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:gap-3 text-[15px] font-medium">
            {/* One language control instead of a row of codes. */}
            <details data-popover className="relative hidden lg:block group/lang">
              <summary
                className={cn(
                  "list-none cursor-pointer [&::-webkit-details-marker]:hidden inline-flex items-center gap-1.5 rounded-full px-3 h-11 transition-colors",
                  FOCUS,
                  ink
                )}
                aria-label={`${t.languages}: ${LOCALE_NAME[locale].label}`}
              >
                <Globe className="w-4 h-4" aria-hidden="true" />
                {LOCALE_NAME[locale].short}
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open/lang:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="absolute right-0 top-full mt-2 w-44 rounded-2xl border border-[#E8E5DD] bg-[#FAFAF7] p-1.5 shadow-lg shadow-[#303568]/10">
                {LOCALES.map((l) => (
                  <li key={l}>
                    <a
                      href={languageHref(page, l)}
                      hrefLang={l}
                      lang={l}
                      aria-current={l === locale ? "true" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-3 min-h-[44px] text-[15px] text-[#303568] hover:bg-[#ECF7E7]",
                        FOCUS,
                        l === locale && "font-semibold"
                      )}
                    >
                      {LOCALE_NAME[l].label}
                      {l === locale ? <Check className="w-4 h-4 text-[#1A7F52]" aria-hidden="true" /> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
            <a
              href={appUrl("/app/login")}
              className={cn(BTN, "hidden lg:inline-flex rounded-full px-5 h-11 font-semibold text-[15px]", quiet)}
            >
              {t.signIn}
            </a>
            <a
              href={appUrl(SIGNUP_PATH)}
              {...trackedLink("cta_signup", { attribution: true })}
              className={cn(BTN, "hidden min-[420px]:inline-flex rounded-full px-4 lg:px-6 h-11 font-semibold lg:text-[15px]", filled)}
            >
              {cta}
            </a>
            <details data-menu className="lg:hidden group/menu">
              <summary
                className={cn("list-none cursor-pointer p-3 -mr-3 [&::-webkit-details-marker]:hidden text-[#303568]", FOCUS)}
                aria-label={t.menu}
              >
                <Menu className="w-6 h-6" aria-hidden="true" />
              </summary>
              <div className="hidden group-open/menu:block [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-[#303568] absolute inset-x-0 top-full border-y border-[#E8E5DD] bg-[#FAFAF7] px-4 sm:px-6 pb-5 pt-2 max-h-[calc(100dvh-72px)] overflow-y-auto">
                <nav aria-label={t.menu} className="max-w-xl mx-auto flex flex-col">
                  {links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="text-lg text-[#303568] font-semibold min-h-[52px] flex items-center border-b border-[#E8E5DD]"
                    >
                      {link.label}
                    </a>
                  ))}
                  <a
                    href={demo.href}
                    {...demoLangProps}
                    {...trackedLink("cta_demo_page")}
                    className="text-lg text-[#303568] font-semibold min-h-[52px] flex items-center border-b border-[#E8E5DD]"
                  >
                    {t.bookDemo}
                  </a>
                  <p className="mt-5 mb-1 text-xs font-semibold uppercase tracking-widest text-[#303568]/70">
                    {audiences.label}
                  </p>
                  {AUDIENCE_PAGES.map((id, i) => (
                    <a
                      key={id}
                      href={pagePath(id, locale)}
                      aria-current={page === id ? "page" : undefined}
                      className="min-h-[52px] flex flex-col justify-center border-b border-[#E8E5DD]"
                    >
                      <span className="inline-flex items-center gap-1.5 text-base font-semibold text-[#303568]">
                        {audiences.items[i].title}
                        {page === id ? <Check className="w-4 h-4 text-[#1A7F52]" aria-hidden="true" /> : null}
                      </span>
                      <span className="text-sm text-[#303568]/70">{audiences.items[i].sub}</span>
                    </a>
                  ))}
                  <p className="mt-5 mb-1 text-xs font-semibold uppercase tracking-widest text-[#303568]/70">
                    {t.languages}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {LOCALES.map((l) => (
                      <a
                        key={l}
                        href={languageHref(page, l)}
                        hrefLang={l}
                        lang={l}
                        aria-current={l === locale ? "true" : undefined}
                        className={cn(
                          "min-h-[44px] rounded-full flex items-center justify-center text-[15px] border",
                          l === locale
                            ? "border-[#303568] text-[#303568] font-semibold"
                            : "border-[#E8E5DD] text-[#303568]/80"
                        )}
                      >
                        {LOCALE_NAME[l].label}
                      </a>
                    ))}
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <a
                      href={appUrl("/app/login")}
                      className={cn(BTN, "rounded-full h-12 font-semibold text-base border border-[#303568]/20 text-[#303568] hover:bg-[#303568]/5")}
                    >
                      {t.signIn}
                    </a>
                    <a
                      href={appUrl(SIGNUP_PATH)}
                      {...trackedLink("cta_signup", { attribution: true })}
                      className={cn(BTN, "rounded-full h-12 font-semibold text-base", filled)}
                    >
                      {cta}
                    </a>
                  </div>
                </nav>
              </div>
            </details>
          </div>
        </div>
        </div>
      </HeaderShell>
      <div aria-hidden="true" className="h-[72px]" />
    </>
  );
}

/**
 * Tabs at the top of the green hero: one per audience page, the current
 * one underlined in ink (none on the home page, which is for everyone) (the product's own tab style, DESIGN.md "Header and
 * tabs"). Plain links, one page each.
 */
export function AudienceTabs({
  locale,
  active,
  className,
}: {
  locale: Locale;
  active?: AudiencePageId;
  className?: string;
}) {
  const a = SITE_COPY[locale].audiences;
  return (
    <nav aria-label={a.label} className={cn("max-w-6xl mx-auto", className)}>
      <ul className="flex gap-4 sm:gap-8 border-b border-[#303568]/15 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {AUDIENCE_PAGES.map((id, i) => {
          const current = id === active;
          const Icon = AUDIENCE_ICONS[i];
          return (
            <li key={id} className="shrink-0">
              <a
                href={pagePath(id, locale)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 min-h-[48px] border-b-2 text-[13px] sm:text-[15px] font-semibold whitespace-nowrap transition-colors",
                  FOCUS,
                  current
                    ? "border-[#303568] text-[#303568]"
                    : "border-transparent text-[#303568]/75 hover:text-[#303568] hover:border-[#303568]/30"
                )}
              >
                <Icon className="hidden sm:block w-4 h-4 shrink-0" aria-hidden="true" />
                {a.items[i].title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = SITE_COPY[locale];
  const home = LOCALE_HOME[locale];
  const others = LOCALES.filter((l) => l !== locale);
  const guidePaper = MARKETING_PAGES.guidePaper.paths[locale];
  const guideOutlays = MARKETING_PAGES.guideOutlays.paths[locale];
  const columns: { title: string; links: { label: string; href: string; lang?: Locale; track?: TrackedLinkAttrs }[] }[] = [
    {
      title: t.footer.product,
      links: [
        { label: t.nav.how, href: `${home}#how` },
        ...(SHOW_PRICES ? [{ label: t.nav.pricing, href: `${home}#pricing` }] : []),
        { label: t.footer.faq, href: `${home}#faq` },
      ],
    },
    {
      title: t.footer.whoFor,
      links: [
        { label: t.footer.smallBusiness, href: pagePath("smallBusiness", locale) },
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
        ...(guideOutlays && t.footer.guideOutlays
          ? [{ label: t.footer.guideOutlays, href: guideOutlays }]
          : []),
        { label: t.footer.allGuides, href: pagePath("guides", locale) },
      ],
    },
    {
      title: t.footer.company,
      links: [
        { label: t.footer.about, href: pagePath("about", locale) },
        // No hrefLang here: the footer's hreflang links are its language switch.
        { label: t.nav.bookDemo, href: demoRequestPath(locale), track: trackedLink("cta_demo_page") },
        { label: t.footer.contact, href: SUPPORT_MAILTO },
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
                      {...link.track}
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
