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
import { HeaderShell } from "./_header-shell";


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

/** The pages the audience switch points at, in its order. */
const AUDIENCE_PAGES = ["home", "freelancers", "accountants"] as const;
export type AudiencePageId = (typeof AUDIENCE_PAGES)[number];

/**
 * The marketing header. Links on the left, the wordmark in the middle, sign
 * in and the two calls to action on the right; below 1024px the wordmark
 * moves left and the links go into a menu. `overHero`: the page starts with
 * the green hero, so the bar sits clear on it until the page scrolls (see
 * HeaderShell). The header is fixed; without a hero under it a spacer keeps
 * the page's content below it.
 */
export function SiteHeader({
  locale,
  page,
  pilotMode,
  overHero = false,
}: {
  locale: Locale;
  page: MarketingPageId;
  pilotMode: boolean;
  overHero?: boolean;
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
  const others = LOCALES.filter((l) => l !== locale);

  // Two looks: clear on the green hero, cream once solid (data-solid).
  const ink =
    "text-white/85 hover:text-white group-data-[solid=true]/hdr:text-[#303568]/70 group-data-[solid=true]/hdr:hover:text-[#303568]";
  const outline =
    "border border-white/60 text-white hover:bg-white/10 group-data-[solid=true]/hdr:border-[#303568]/20 group-data-[solid=true]/hdr:text-[#303568] group-data-[solid=true]/hdr:hover:bg-[#303568]/5";
  const filled = "bg-[#303568] text-white hover:bg-[#252850]";

  return (
    <>
      {/* The marketing site has no dark design: keep it light on shared hosts. */}
      <LightOnly />
      <HeaderShell overHero={overHero}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[72px] flex items-center gap-4 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-8">
          <nav aria-label="Main" className="hidden lg:flex items-center gap-7 text-[15px] font-medium">
            {links.map((link) => (
              <a key={link.href} href={link.href} className={cn("whitespace-nowrap transition-colors", ink)}>
                {link.label}
              </a>
            ))}
          </nav>

          <a href={home} aria-label={`UnReceipt — ${t.home}`} className="relative py-1 mr-auto lg:mr-0">
            {/* On the green hero the mint set (navy word, its arrow stays visible);
                the full-colour mark once the bar is cream. */}
            <span className="block transition-opacity duration-300 group-data-[solid=true]/hdr:opacity-0">
              <Wordmark variant="horizontal" on="mint" className="text-[22px] sm:text-[26px]" />
            </span>
            <span className="absolute inset-0 py-1 opacity-0 transition-opacity duration-300 group-data-[solid=true]/hdr:opacity-100" aria-hidden="true">
              <Wordmark variant="horizontal" on="light" className="text-[22px] sm:text-[26px]" />
            </span>
          </a>

          <div className="hidden lg:flex items-center justify-end gap-5 text-[15px] font-medium">
            <span className="inline-flex items-center gap-1.5 text-white/85 group-data-[solid=true]/hdr:text-[#303568]/70">
              <Globe className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">{t.languages}</span>
              {others.map((l) => (
                <a
                  key={l}
                  href={languageHref(page, l)}
                  hrefLang={l}
                  lang={l}
                  aria-label={LOCALE_NAME[l].label}
                  className={cn("px-0.5 transition-colors", ink)}
                >
                  {LOCALE_NAME[l].short}
                </a>
              ))}
            </span>
            <a href={appUrl("/app/login")} className={cn("whitespace-nowrap transition-colors", ink)}>
              {t.signIn}
            </a>
            <a
              href={appUrl("/demo")}
              className={cn(BTN, "hidden xl:inline-flex rounded-full px-5 h-11 font-semibold text-[15px]", outline)}
            >
              {t.demo}
            </a>
            <a href={appUrl(SIGNUP_PATH)} className={cn(BTN, "rounded-full px-6 h-11 font-semibold text-[15px]", filled)}>
              {cta}
            </a>
          </div>

          <a
            href={appUrl(SIGNUP_PATH)}
            className={cn(BTN, "hidden min-[380px]:inline-flex lg:hidden rounded-full px-4 h-10 font-semibold", filled)}
          >
            {cta}
          </a>
          <details className="lg:hidden group/menu">
            <summary
              className={cn(
                "list-none cursor-pointer p-3 -mr-3 [&::-webkit-details-marker]:hidden",
                "text-white group-data-[solid=true]/hdr:text-[#303568]"
              )}
              aria-label={t.menu}
            >
              <Menu className="w-6 h-6" aria-hidden="true" />
            </summary>
            <div className="hidden group-open/menu:block absolute inset-x-0 top-full border-y border-[#E8E5DD] bg-[#FAFAF7] px-4 sm:px-6 pb-5 pt-2 max-h-[calc(100dvh-72px)] overflow-y-auto">
              <div className="max-w-xl mx-auto flex flex-col">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-lg text-[#303568] font-semibold min-h-[52px] flex items-center border-b border-[#E8E5DD]"
                  >
                    {link.label}
                  </a>
                ))}
                <p className="mt-5 mb-1 text-xs font-semibold uppercase tracking-widest text-[#303568]/50">
                  {audiences.label}
                </p>
                {AUDIENCE_PAGES.map((id, i) => (
                  <a
                    key={id}
                    href={pagePath(id, locale)}
                    aria-current={page === id ? "page" : undefined}
                    className="min-h-[52px] flex flex-col justify-center border-b border-[#E8E5DD]"
                  >
                    <span className={cn("text-base font-semibold", page === id ? "text-[#1A7F52]" : "text-[#303568]")}>
                      {audiences.items[i].title}
                    </span>
                    <span className="text-sm text-[#303568]/60">{audiences.items[i].sub}</span>
                  </a>
                ))}
                <div className="mt-4 flex items-center gap-4 text-base font-medium text-[#303568]">
                  <a href={appUrl("/app/login")} className="min-h-[44px] flex items-center">
                    {t.signIn}
                  </a>
                  <span className="ml-auto inline-flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#303568]/60" aria-hidden="true" />
                    {others.map((l) => (
                      <a
                        key={l}
                        href={languageHref(page, l)}
                        hrefLang={l}
                        lang={l}
                        aria-label={LOCALE_NAME[l].label}
                        className="min-h-[44px] min-w-[36px] flex items-center justify-center"
                      >
                        {LOCALE_NAME[l].short}
                      </a>
                    ))}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <a
                    href={appUrl("/demo")}
                    className={cn(BTN, "rounded-full h-12 font-semibold text-base border border-[#303568]/20 text-[#303568] hover:bg-[#303568]/5")}
                  >
                    {t.demo}
                  </a>
                  <a href={appUrl(SIGNUP_PATH)} className={cn(BTN, "rounded-full h-12 font-semibold text-base", filled)}>
                    {cta}
                  </a>
                </div>
              </div>
            </div>
          </details>
        </div>
      </HeaderShell>
      {overHero ? null : <div aria-hidden="true" className="h-[72px]" />}
    </>
  );
}

/**
 * Pleo-style pill at the top of the green hero: one segment per audience,
 * the current page's filled. Plain links, one page each.
 */
export function AudienceSwitch({
  locale,
  active,
  className,
}: {
  locale: Locale;
  active: AudiencePageId;
  className?: string;
}) {
  const a = SITE_COPY[locale].audiences;
  return (
    <nav aria-label={a.label} className={cn("flex justify-center", className)}>
      <ul className="grid grid-cols-3 w-full max-w-[640px] gap-1 rounded-full bg-[#FAFAF7] p-1.5 shadow-xl shadow-[#1F9D63]/25">
        {AUDIENCE_PAGES.map((id, i) => {
          const current = id === active;
          return (
            <li key={id} className="flex">
              <a
                href={pagePath(id, locale)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center text-center rounded-full px-2 sm:px-4 min-h-[44px] sm:min-h-[56px] py-1.5 transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303568]",
                  current ? "bg-[#303568] text-white" : "text-[#303568] hover:bg-[#ECF7E7]"
                )}
              >
                <span className="text-[13px] sm:text-sm font-semibold leading-tight">{a.items[i].title}</span>
                <span
                  className={cn(
                    "hidden sm:block text-xs leading-tight mt-0.5",
                    current ? "text-white/70" : "text-[#303568]/55"
                  )}
                >
                  {a.items[i].sub}
                </span>
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
