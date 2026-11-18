"use client";

import { useState, useEffect, useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  CheckCircle2,
  UserRound,
  Building2,
  Camera,
  Calculator,
  Menu,
  X,
  Mail,
  FileText,
  Download,
  Search,
  ReceiptText,
  Sparkles,
  ChevronDown,
  Globe,
} from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ExplainerVideo } from "./_explainer-video";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import { trackedLink } from "@/lib/tracking/events";
import { cn } from "@/lib/utils";
import type { FaqItem } from "@/lib/faq";
import { fill } from "@/lib/fill";
import { LOCALES, LOCALE_HOME, LOCALE_NAME, type Locale } from "@/lib/locale";
import { demoRequestLang, demoRequestPath, pagePath } from "@/lib/marketing-pages";
import { PLANS, planPriceLabel } from "@/lib/plans";
import { SHOW_PRICES } from "@/lib/pricing-visibility";
import type { LandingCopy } from "./_landing-copy";
import { Pricing } from "./_pricing";
import { ReceiptBackdrop, ReceiptRows } from "./_receipt-backdrop";
import type { LandingReceipt } from "./_receipt-text";

/* ── Scroll-reveal hook ── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (reduced || inViewport) {
      // Needs the element's measured position, which only exists after
      // mount — one extra render on load is the intended cost here.
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    const fallback = window.setTimeout(() => setVisible(true), 1200);
    return () => { obs.disconnect(); window.clearTimeout(fallback); };
  }, []);
  return { ref, visible };
}

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const { ref, visible } = useReveal();
  return (
    <section
      ref={ref}
      id={id}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </section>
  );
}

/* ── Receipt edge SVG ── */
function ReceiptEdge({ color = "#27BE7B", flip = false }: { color?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 40"
      className={`w-full block ${flip ? "rotate-180" : ""}`}
      preserveAspectRatio="none"
      style={{ height: "20px" }}
    >
      <path
        d={`M0,0 ${Array.from({ length: 36 }, (_, i) => {
          const x = i * 40 + 20;
          return `Q${x - 10},40 ${x},0 Q${x + 10},40 ${x + 20},0`;
        }).join(" ")} L1440,0`}
        fill={color}
      />
    </svg>
  );
}

/* ── Scrolling receipt ticker ── */
function ReceiptTicker({ t, samples }: { t: LandingCopy["ticker"]; samples: LandingCopy["samples"] }) {
  // Example receipts. Source is how it reached UnReceipt (forwarded email
  // or a photo); AI reads it and the owner confirms it.
  const receipts = samples.ticker.map((r) => ({ ...r, category: t.categories[r.category] }));

  const doubled = [...receipts, ...receipts];

  return (
    <div className="relative overflow-hidden py-6">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#FAFAF7] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#FAFAF7] to-transparent z-10" />

      <div className="flex gap-4 animate-[scroll_30s_linear_infinite]">
        {doubled.map((r, i) => (
          <div
            key={`${r.merchant}-${i}`}
            className="flex-shrink-0 bg-[#ECF7E7] rounded-2xl px-5 py-3.5 flex items-center gap-4 border border-[#27BE7B]/10"
          >
            <div className="w-9 h-9 rounded-xl bg-[#27BE7B]/15 flex items-center justify-center">
              {r.source === "email" ? (
                <Mail className="w-4 h-4 text-[#27BE7B]" />
              ) : (
                <Camera className="w-4 h-4 text-[#27BE7B]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#303568] whitespace-nowrap">{r.merchant}</p>
              <p className="text-[10px] text-[#303568]/40 uppercase tracking-wider">{r.category}</p>
            </div>
            <div className="text-right pl-3">
              <p className="text-sm font-extrabold text-[#303568] whitespace-nowrap">{r.amount}</p>
              <p className="text-[10px] text-[#27BE7B] font-semibold">
                {t.verified}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Floating receipt animation in hero ── */
function FloatingReceipts() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Animated receipt shapes */}
      {[
        { top: "10%", left: "5%", delay: "0s", size: "w-14 h-18", rotate: "-12deg", duration: "8s" },
        { top: "60%", left: "8%", delay: "2s", size: "w-10 h-14", rotate: "8deg", duration: "7s" },
        { top: "25%", right: "7%", delay: "1s", size: "w-12 h-16", rotate: "-5deg", duration: "9s" },
        { top: "70%", right: "12%", delay: "3s", size: "w-8 h-12", rotate: "15deg", duration: "6s" },
        { top: "45%", left: "15%", delay: "4s", size: "w-10 h-14", rotate: "-8deg", duration: "10s" },
      ].map((r, i) => (
        <div
          key={i}
          className="absolute opacity-[0.08]"
          style={{
            top: r.top,
            left: r.left,
            right: r.right,
            animation: `float ${r.duration} ease-in-out ${r.delay} infinite`,
            transform: `rotate(${r.rotate})`,
          }}
        >
          <ReceiptText className={`${r.size} text-white`} />
        </div>
      ))}
    </div>
  );
}

/**
 * One language of the landing page. Everything language-specific arrives as
 * props from the server (`_landing-page.tsx`), so the browser downloads only
 * this page's language, never the copy of all three.
 */
export type LandingViewProps = {
  pilotMode: boolean;
  locale: Locale;
  copy: LandingCopy;
  /** The site-wide "Accountants" nav label in this language. */
  accountantsLabel: string;
  /** "Book a demo" in the nav (SITE_COPY), passed from the server like accountantsLabel. */
  bookDemoLabel: string;
  faq: FaqItem[];
  receipt: LandingReceipt;
  /** The site footer, rendered on the server. */
  footer: React.ReactNode;
  /** The contact block at the end of the page (form and its copy, this language only). */
  contact: React.ReactNode;
};

export function LandingView({
  pilotMode,
  locale,
  copy: t,
  accountantsLabel,
  bookDemoLabel,
  faq,
  receipt,
  footer,
  contact,
}: LandingViewProps) {
  const otherLocales = LOCALES.filter((l) => l !== locale);
  const s = t.samples;
  const fromPrice = planPriceLabel(PLANS[0], locale);
  const navCta = pilotMode ? t.nav.ctaPilot : t.nav.ctaPaid;
  const heroCta = pilotMode ? t.hero.ctaPilot : t.hero.ctaPaid;
  const accountantsPath = pagePath("accountants", locale);
  const demoPath = demoRequestPath(locale);
  const demoLangProps = demoRequestLang(locale) !== locale ? { hrefLang: demoRequestLang(locale) } : {};
  const navLinks = [
    { label: t.nav.how, href: "#how" },
    ...(SHOW_PRICES ? [{ label: t.nav.pricing, href: "#pricing" }] : []),
    { label: t.nav.about, href: "#about" },
    { label: accountantsLabel, href: accountantsPath },
    { label: t.nav.faq, href: "#faq" },
  ];
  // "Who it's for" cards link to each audience's own page.
  const audienceLinks = [pagePath("smallBusiness", locale), pagePath("freelancers", locale), accountantsPath];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);


  return (
    <div id="top" className="min-h-screen bg-[#ECF7E7]">
      {/* The marketing site has no dark design: keep it light on shared hosts. */}
      {/* ─── NAV ─── */}
      {/* Solid cream bar from the first pixel so the full-color primary
          lockup never has to swap variants mid-scroll. Only the hairline
          appears once the page moves. */}
      <nav className={`fixed top-0 left-0 right-0 z-50 bg-[#FAFAF7] border-b transition-colors duration-300 ${scrolled ? "border-[#E8E5DD]" : "border-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-6 py-3">
          <a href="#top" aria-label={t.nav.backToTop} className="py-1">
            <Wordmark variant="horizontal" on="light" className="text-[22px] sm:text-[26px]" />
          </a>
          <div className="hidden xl:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium whitespace-nowrap transition-colors text-[#303568]/70 hover:text-[#303568] py-3 -my-3"
              >
                {link.label}
              </a>
            ))}
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#303568]/70">
              <Globe className="w-4 h-4" aria-hidden="true" />
              {otherLocales.map((l) => (
                <a
                  key={l}
                  href={LOCALE_HOME[l]}
                  hrefLang={l}
                  lang={l}
                  aria-label={LOCALE_NAME[l].label}
                  className="hover:text-[#303568] py-3 -my-3 px-0.5"
                >
                  {LOCALE_NAME[l].short}
                </a>
              ))}
            </span>
            <a
              href={appUrl("/app/login")}
              className="text-sm font-medium whitespace-nowrap text-[#303568]/70 hover:text-[#303568] py-3 -my-3"
            >
              {t.nav.signIn}
            </a>
            <a
              href={demoPath}
              {...demoLangProps}
              {...trackedLink("cta_demo_page")}
              className={cn(buttonVariants({
                size: "sm",
                variant: "outline",
                className: "border-2 border-[#303568]/20 bg-transparent text-[#303568] hover:border-[#303568] hover:bg-transparent font-semibold rounded-full px-5 h-11",
              }))}
            >
              {bookDemoLabel}
            </a>
            <a
              href={appUrl(SIGNUP_PATH)}
              {...trackedLink("cta_signup", { attribution: true })}
              className={cn(buttonVariants({
                size: "sm",
                className: "bg-[#27BE7B] text-white hover:bg-[#1F9D63] font-semibold rounded-full px-6 h-11",
              }))}
            >
              {navCta}
            </a>
          </div>
          <button
            type="button"
            aria-label={mobileMenuOpen ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            className={`xl:hidden p-3 -mr-1 text-[#303568]`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div id="mobile-menu" className="xl:hidden bg-white border-t border-gray-100 px-4 py-2 flex flex-col shadow-lg">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="text-base text-[#303568] font-medium min-h-[44px] flex items-center" onClick={() => setMobileMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            <a
              href={demoPath}
              {...demoLangProps}
              {...trackedLink("cta_demo_page")}
              onClick={() => setMobileMenuOpen(false)}
              className="text-base text-[#303568] font-medium min-h-[44px] flex items-center"
            >
              {bookDemoLabel}
            </a>
            <a
              href={appUrl("/app/login")}
              onClick={() => setMobileMenuOpen(false)}
              className="text-base text-[#303568] font-medium min-h-[44px] flex items-center border-t border-gray-100 mt-2 pt-2"
            >
              {t.nav.signIn}
            </a>
            {otherLocales.map((l) => (
              <a
                key={l}
                href={LOCALE_HOME[l]}
                hrefLang={l}
                lang={l}
                onClick={() => setMobileMenuOpen(false)}
                className="text-base text-[#303568] font-medium min-h-[44px] flex items-center gap-2"
              >
                <Globe className="w-4 h-4" aria-hidden="true" />
                {LOCALE_NAME[l].label}
              </a>
            ))}
            <a
              href={appUrl(SIGNUP_PATH)}
              {...trackedLink("cta_signup", { attribution: true })}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(buttonVariants({
                className: "mt-2 w-full bg-[#27BE7B] text-white hover:bg-[#1fa568] font-semibold rounded-full h-12",
              }))}
            >
              {navCta}
            </a>
          </div>
        )}
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative bg-[#27BE7B] pt-28 pb-20 sm:pt-36 sm:pb-28 px-4 sm:px-6 overflow-hidden">
        {/* Floating receipt shapes */}
        <FloatingReceipts />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — Copy */}
            <div>
              {/* The h1 carries the words people search for; the slogan
                  below keeps its size but is not the page's heading. */}
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 mb-8">
                <Sparkles className="w-3.5 h-3.5 text-white shrink-0" aria-hidden="true" />
                <h1 className="text-white/90 text-xs font-semibold tracking-wide uppercase">{t.hero.seoTitle}</h1>
              </div>
              <p className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.08] mb-6 text-white">
                {t.hero.titleLine1}<br />{t.hero.titleLine2}<br />
                <span className="text-[#303568]">{t.hero.titleAccent}</span>
              </p>
              <p className="text-white/90 text-lg sm:text-xl leading-relaxed max-w-lg mb-10">
                {t.hero.lead}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={appUrl(SIGNUP_PATH)}
                  {...trackedLink("cta_signup", { attribution: true })}
                  className={cn(buttonVariants({
                    size: "lg",
                    className: "bg-white text-[#27BE7B] hover:bg-white/90 rounded-full px-8 text-base font-semibold shadow-lg shadow-black/15 h-12",
                  }))}
                >
                  {heroCta}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </a>
                <a
                  href={demoPath}
                  {...demoLangProps}
                  {...trackedLink("cta_demo_page")}
                  className={cn(buttonVariants({
                    size: "lg",
                    variant: "outline",
                    className: "border-2 border-white text-white hover:bg-white hover:text-[#27BE7B] rounded-full px-8 text-base font-semibold bg-transparent h-12",
                  }))}
                >
                  {bookDemoLabel}
                </a>
              </div>
              <p className="text-white/80 text-sm mt-4">
                {SHOW_PRICES
                  ? fill(pilotMode ? t.hero.notePilot : t.hero.notePaid, { price: fromPrice })
                  : pilotMode
                    ? t.hero.notePilotNoPrice
                    : t.hero.notePaidNoPrice}
              </p>
            </div>

            {/* Right — Phone mockup */}
            <div className="hidden lg:flex justify-center">
              <div className="relative">
                {/* Phone frame */}
                <div className="w-[260px] h-[520px] bg-[#303568] rounded-[3rem] p-3 shadow-2xl shadow-black/30 relative animate-[phoneFloat_6s_ease-in-out_infinite]">
                  <div className="w-full h-full bg-white rounded-[2.25rem] overflow-hidden relative">
                    {/* Status bar */}
                    <div className="h-12 bg-[#27BE7B] flex items-center justify-center">
                      <span className="text-white text-xs font-bold tracking-wider">UNRECEIPT</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Latest receipt, confirmed by its owner */}
                      <div className="bg-[#ECF7E7] rounded-2xl p-4 border border-[#27BE7B]/20 animate-[pulseGlow_3s_ease-in-out_infinite]">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-4 h-4 text-[#27BE7B]" />
                          <span className="text-[10px] font-semibold text-[#303568]/60 uppercase tracking-wider">{t.phone.verified}</span>
                        </div>
                        <p className="text-sm font-bold text-[#303568]">{s.latest.merchant}</p>
                        <p className="text-xs text-[#303568]/60 mt-1">{t.phone.latestMeta}</p>
                        <p className="text-2xl font-extrabold text-[#27BE7B] mt-2">{s.latest.amount}</p>
                      </div>
                      <div className="bg-gray-50 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#303568]/60">{t.phone.today}</span>
                          <span className="text-xs font-bold text-[#27BE7B]">{t.phone.todayCount}</span>
                        </div>
                        <div className="space-y-2">
                          {s.today.map((item) => (
                            <div key={item.merchant} className="flex items-center justify-between py-1.5">
                              <div>
                                <p className="text-xs font-semibold text-[#303568]">{item.merchant}</p>
                                <p className="text-[10px] text-[#303568]/40">{item.time}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#303568]">{item.amount}</span>
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#27BE7B]" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <Button className="w-full bg-[#27BE7B] text-white rounded-xl text-xs font-bold h-10 hover:bg-[#1fa568]">
                        <Camera className="w-3.5 h-3.5 mr-1.5" />
                        {t.phone.snap}
                      </Button>
                    </div>
                  </div>
                  {/* Notch */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-[#303568] rounded-b-2xl" />
                </div>

                {/* Floating receipt cards */}
                <div className="absolute -left-16 top-20 bg-white rounded-xl shadow-lg shadow-black/10 p-3 w-36 rotate-[-6deg] animate-[float_6s_ease-in-out_infinite]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-[#27BE7B]/10 flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-[#27BE7B]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#303568]">{t.phone.verified}</span>
                  </div>
                  <p className="text-xs text-[#303568]/60">{s.photoCard.merchant}</p>
                  <p className="text-sm font-extrabold text-[#303568]">{s.photoCard.amount}</p>
                </div>

                <div className="absolute -right-12 bottom-28 bg-white rounded-xl shadow-lg shadow-black/10 p-3 w-32 rotate-[4deg] animate-[float_5s_ease-in-out_infinite_1s]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-[#27BE7B]/10 flex items-center justify-center">
                      <Mail className="w-3 h-3 text-[#27BE7B]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#303568]">{t.phone.forwarded}</span>
                  </div>
                  <p className="text-xs text-[#303568]/60">{s.emailCard.merchant}</p>
                  <p className="text-sm font-extrabold text-[#303568]">{s.emailCard.amount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt edge transition */}
        <div className="absolute bottom-0 left-0 right-0">
          <ReceiptEdge color="#FAFAF7" />
        </div>
      </section>

      {/* Everything between the hero and the waitlist shares one cream
          surface with the printing receipt behind it, so these sections
          carry no background of their own. */}
      <div className="receipt-scope relative isolate bg-[#FAFAF7] pb-16">
      <ReceiptBackdrop currency={receipt.text.currency} />
      <ReceiptRows text={receipt.text} rows={receipt.rows.top} />

      {/* ─── SOCIAL PROOF BAR ─── */}
      <Section className="py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {t.stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl sm:text-3xl font-extrabold text-[#303568]">{stat.value}</p>
                <p className="text-sm text-[#303568]/70 mt-1 leading-snug">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── RECEIPT TICKER ─── */}
      <section className="py-4 overflow-hidden">
        <ReceiptTicker t={t.ticker} samples={t.samples} />
      </section>

      <ReceiptRows text={receipt.text} rows={receipt.rows.features} />

      {/* ─── FEATURES — 3 PILLARS ─── */}
      <Section id="features" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">{t.features.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568]">
              {t.features.title}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {t.features.items.map((item, i) => ({ ...item, icon: [Mail, ReceiptText, Search][i] })).map((feature) => (
              <div key={feature.title} className="text-center px-2">
                <div className="w-16 h-16 rounded-2xl bg-[#27BE7B]/10 flex items-center justify-center mx-auto mb-6">
                  <feature.icon className="w-7 h-7 text-[#27BE7B]" />
                </div>
                <h3 className="font-bold text-lg mb-3 text-[#303568]">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#303568]/70 max-w-xs mx-auto">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <ReceiptRows text={receipt.text} rows={receipt.rows.how} />

      {/* ─── HOW IT WORKS ─── */}
      <Section id="how" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">{t.how.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
              {t.how.title}
            </h2>
            <p className="text-[#303568]/50 text-lg max-w-2xl mx-auto">
              {t.how.lead}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-10 left-[16.67%] right-[16.67%] h-[2px] bg-[#27BE7B]/20" />
            {t.how.items.map((item, i) => ({ ...item, icon: [Mail, CheckCircle2, FileText][i], step: `0${i + 1}` })).map((item) => (
              <div key={item.step} className="text-center relative">
                <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-5 relative z-10 shadow-sm">
                  <item.icon className="w-8 h-8 text-[#27BE7B]" />
                </div>
                <div className="text-xs font-bold text-[#27BE7B] mb-2 tracking-widest">
                  {t.how.step} {item.step}
                </div>
                <h3 className="font-bold text-[#303568] text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-[#303568]/50 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <ReceiptRows text={receipt.text} rows={receipt.rows.difference} />

      {/* ─── COMPARISON ─── */}
      <Section id="difference" className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">{t.difference.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
              {t.difference.title}
            </h2>
            <p className="text-[#303568]/50 text-lg">
              {t.difference.lead}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm rounded-3xl bg-[#ECF7E7]">
              <CardContent className="pt-8 pb-8 px-8">
                <h3 className="font-bold mb-6 text-red-400 text-sm uppercase tracking-widest">
                  {t.difference.oldTitle}
                </h3>
                <ul className="space-y-4 text-sm">
                  {t.difference.old.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[#303568]/60">
                      <X className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg shadow-[#27BE7B]/20 rounded-3xl bg-[#27BE7B]">
              <CardContent className="pt-8 pb-8 px-8">
                <h3 className="font-bold mb-6 text-white text-sm uppercase tracking-widest">
                  {t.difference.newTitle}
                </h3>
                <ul className="space-y-4 text-sm">
                  {t.difference.new.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-white">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-white shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>

      {/* ─── PRICING ─── (hidden while SHOW_PRICES is off) */}
      {SHOW_PRICES ? (
        <>
          <ReceiptRows text={receipt.text} rows={receipt.rows.pricing} />
          <Section id="pricing" className="py-20 px-4 sm:px-6">
            <Pricing
              locale={locale}
              copy={t.pricing}
              cta={heroCta}
              note={pilotMode ? t.pricing.notePilot : t.pricing.notePaid}
            />
          </Section>
        </>
      ) : null}

      <ReceiptRows text={receipt.text} rows={receipt.rows.about} />

      {/* ─── BUILT FOR TEAMS ─── */}
      <Section id="about" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">{t.about.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568]">
              {t.about.title}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10 md:gap-8">
            {t.about.items.map((item, i) => ({ ...item, icon: [Building2, UserRound, Calculator][i], href: audienceLinks[i] })).map((item) => (
              <div key={item.title}>
                <div className="w-14 h-14 rounded-2xl bg-[#27BE7B]/10 flex items-center justify-center mb-5">
                  <item.icon className="w-6 h-6 text-[#27BE7B]" />
                </div>
                <h3 className="font-bold text-[#303568] text-lg mb-3">{item.title}</h3>
                <p className="text-sm text-[#303568]/70 leading-relaxed mb-4">
                  {item.desc}
                </p>
                <a
                  href={item.href}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1F9D63] hover:text-[#303568]"
                >
                  {t.about.more}
                  <span className="sr-only">: {item.title}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── FAQ ─── */}
      <Section id="faq" className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">{t.faq.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568]">
              {t.faq.title}
            </h2>
          </div>
          {/* Native <details>: every answer is in the HTML, so search
              engines and AI assistants read it without running JS. */}
          <div className="space-y-3">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group bg-white border border-[#E8E5DD] rounded-2xl px-5 sm:px-6 open:pb-5"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none py-4 sm:py-5 font-bold text-[#303568] [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base sm:text-lg">{item.q}</h3>
                  <ChevronDown className="w-5 h-5 shrink-0 text-[#27BE7B] transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-sm sm:text-base leading-relaxed text-[#303568]/70">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      <ReceiptRows text={receipt.text} rows={receipt.rows.badges} />

      {/* ─── TRUST BADGES ─── */}
      <Section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {t.badges.map((label, i) => ({ label, icon: [Mail, FileText, Download, CheckCircle2][i] })).map((badge) => (
              <div key={badge.label} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mb-3 shadow-sm">
                  <badge.icon className="w-5 h-5 text-[#27BE7B]" />
                </div>
                <span className="text-xs font-bold text-[#303568]/60 uppercase tracking-wider">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── EXPLAINER VIDEO ─── (languages with their own loop) */}
      {t.video ? (
        <Section className="pt-4 pb-10 px-4 sm:px-6">
          <div className="max-w-xl mx-auto text-center">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">{t.video.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">{t.video.title}</h2>
            <p className="text-[#303568]/50 text-lg mb-10">{t.video.lead}</p>
            <ExplainerVideo className="border border-[#E8E5DD]" />
          </div>
        </Section>
      ) : null}

      <ReceiptRows text={receipt.text} rows={receipt.rows.end} />
      </div>

      {/* ─── CONTACT: book a demo or send a request (the form, from the server) ─── */}
      {contact}

      {/* ─── FOOTER ─── */}
      {footer}

      {/* ─── ANIMATIONS ─── */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(var(--tw-rotate, 0)); }
          50% { transform: translateY(-12px) rotate(var(--tw-rotate, 0)); }
        }
        @keyframes phoneFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(39, 190, 123, 0); }
          50% { box-shadow: 0 0 20px 4px rgba(39, 190, 123, 0.15); }
        }
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
