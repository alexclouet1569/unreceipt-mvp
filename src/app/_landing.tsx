"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  CheckCircle2,
  Smartphone,
  Building2,
  Camera,
  BarChart3,
  Menu,
  X,
  Mail,
  FileText,
  Download,
  Search,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { appUrl } from "@/lib/app-url";
import { cn } from "@/lib/utils";
import { Pricing } from "./_pricing";
import { RECEIPT, ReceiptBackdrop, ReceiptRows } from "./_receipt-backdrop";

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
function ReceiptTicker() {
  // Example receipts. Source is how it reached UnReceipt (forwarded email
  // or a photo); every receipt ends up verified by the concierge.
  const receipts = [
    { merchant: "ICA Maxi", amount: "342 kr", category: "Meals", source: "photo" },
    { merchant: "Spotify", amount: "129 kr", category: "Software", source: "email" },
    { merchant: "Clas Ohlson", amount: "1 450 kr", category: "Office supplies", source: "photo" },
    { merchant: "SJ", amount: "895 kr", category: "Travel", source: "email" },
    { merchant: "Apoteket", amount: "212 kr", category: "Other", source: "photo" },
    { merchant: "SAS", amount: "2 340 kr", category: "Travel", source: "email" },
    { merchant: "Uber", amount: "189 kr", category: "Transport", source: "email" },
    { merchant: "Pressbyr\u00e5n", amount: "68 kr", category: "Meals", source: "photo" },
    { merchant: "Scandic Hotel", amount: "1 250 kr", category: "Accommodation", source: "email" },
    { merchant: "Coop Konferens", amount: "890 kr", category: "Meals", source: "photo" },
  ];

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
                Verified
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

type LandingPageProps = {
  pilotMode: boolean;
};

export function LandingPage({ pilotMode }: LandingPageProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");
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

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setWaitlistError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubmitted(true);
        setEmail("");
      } else {
        const body = await res.json().catch(() => ({}));
        setWaitlistError(body.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setWaitlistError("Couldn't reach us. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="top" className="min-h-screen bg-[#ECF7E7]">
      {/* ─── NAV ─── */}
      {/* Solid cream bar from the first pixel so the full-color primary
          lockup never has to swap variants mid-scroll. Only the hairline
          appears once the page moves. */}
      <nav className={`fixed top-0 left-0 right-0 z-50 bg-[#FAFAF7] border-b transition-colors duration-300 ${scrolled ? "border-[#E8E5DD]" : "border-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between py-3">
          <a href="#top" aria-label="UnReceipt — back to top" className="py-1">
            <Wordmark variant="horizontal" on="light" className="text-[22px] sm:text-[26px]" />
          </a>
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: "Solutions", href: "#features" },
              { label: "How it Works", href: "#how" },
              { label: "Pricing", href: "#pricing" },
              { label: "About", href: "#about" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium transition-colors text-[#303568]/70 hover:text-[#303568] py-3 -my-3"
              >
                {link.label}
              </a>
            ))}
            <a
              href={appUrl("/app/login")}
              className="text-sm font-medium text-[#303568]/70 hover:text-[#303568] py-3 -my-3"
            >
              Sign in
            </a>
            <a
              href={appUrl("/app/login")}
              className={cn(buttonVariants({
                size: "sm",
                className: "bg-[#27BE7B] text-white hover:bg-[#1F9D63] font-semibold rounded-full px-6 h-11",
              }))}
            >
              {pilotMode ? "Join the pilot" : "Start free"}
            </a>
          </div>
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            className={`md:hidden p-3 -mr-1 text-[#303568]`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden bg-white border-t border-gray-100 px-4 py-2 flex flex-col shadow-lg">
            {[
              { label: "Solutions", href: "#features" },
              { label: "How it Works", href: "#how" },
              { label: "Pricing", href: "#pricing" },
              { label: "About", href: "#about" },
            ].map((link) => (
              <a key={link.label} href={link.href} className="text-base text-[#303568] font-medium min-h-[44px] flex items-center" onClick={() => setMobileMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            <a
              href={appUrl("/app/login")}
              onClick={() => setMobileMenuOpen(false)}
              className="text-base text-[#303568] font-medium min-h-[44px] flex items-center border-t border-gray-100 mt-2 pt-2"
            >
              Sign in
            </a>
            <a
              href={appUrl("/app/login")}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(buttonVariants({
                className: "mt-2 w-full bg-[#27BE7B] text-white hover:bg-[#1fa568] font-semibold rounded-full h-12",
              }))}
            >
              {pilotMode ? "Join the pilot" : "Start free"}
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
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 mb-8">
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span className="text-white/90 text-xs font-semibold tracking-wide uppercase">Paper is Past</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.08] mb-6 text-white">
                From Chaos<br />to Clarity —<br />
                <span className="text-[#303568]">Automatically.</span>
              </h1>
              <p className="text-white/90 text-lg sm:text-xl leading-relaxed max-w-lg mb-10">
                Built for Swedish SMBs who hate chasing receipts. Forward any
                receipt — email or photo — and get a VAT-ready record in
                your dashboard within 24 hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={appUrl("/app/login")}
                  className={cn(buttonVariants({
                    size: "lg",
                    className: "bg-white text-[#27BE7B] hover:bg-white/90 rounded-full px-8 text-base font-semibold shadow-lg shadow-black/15 h-12",
                  }))}
                >
                  {pilotMode ? "Join the pilot" : "Start your free week"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </a>
                <a
                  href="#how"
                  className={cn(buttonVariants({
                    size: "lg",
                    variant: "outline",
                    className: "border-2 border-white text-white hover:bg-white hover:text-[#27BE7B] rounded-full px-8 text-base font-semibold bg-transparent h-12",
                  }))}
                >
                  See How it Works
                </a>
              </div>
              <p className="text-white/80 text-sm mt-4">
                {pilotMode
                  ? "Free during the pilot. Plans from €5.99/month after."
                  : "Plans from €5.99/month + VAT after the free week. Cancel anytime."}
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
                      {/* Latest receipt, verified by the concierge */}
                      <div className="bg-[#ECF7E7] rounded-2xl p-4 border border-[#27BE7B]/20 animate-[pulseGlow_3s_ease-in-out_infinite]">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-4 h-4 text-[#27BE7B]" />
                          <span className="text-[10px] font-semibold text-[#303568]/60 uppercase tracking-wider">Verified</span>
                        </div>
                        <p className="text-sm font-bold text-[#303568]">ICA Maxi</p>
                        <p className="text-xs text-[#303568]/60 mt-1">Meals · Moms 12% 36,64 kr</p>
                        <p className="text-2xl font-extrabold text-[#27BE7B] mt-2">342,00 kr</p>
                      </div>
                      <div className="bg-gray-50 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#303568]/60">Today</span>
                          <span className="text-xs font-bold text-[#27BE7B]">3 receipts</span>
                        </div>
                        <div className="space-y-2">
                          {[
                            { name: "Uber", amount: "189,00 kr", time: "14:22" },
                            { name: "Scandic Hotel", amount: "1 250,00 kr", time: "09:15" },
                            { name: "SJ", amount: "895,00 kr", time: "08:30" },
                          ].map((item) => (
                            <div key={item.name} className="flex items-center justify-between py-1.5">
                              <div>
                                <p className="text-xs font-semibold text-[#303568]">{item.name}</p>
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
                        Snap a receipt
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
                    <span className="text-[10px] font-bold text-[#303568]">Verified</span>
                  </div>
                  <p className="text-xs text-[#303568]/60">Clas Ohlson</p>
                  <p className="text-sm font-extrabold text-[#303568]">1 450,00 kr</p>
                </div>

                <div className="absolute -right-12 bottom-28 bg-white rounded-xl shadow-lg shadow-black/10 p-3 w-32 rotate-[4deg] animate-[float_5s_ease-in-out_infinite_1s]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-[#27BE7B]/10 flex items-center justify-center">
                      <Mail className="w-3 h-3 text-[#27BE7B]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#303568]">Forwarded</span>
                  </div>
                  <p className="text-xs text-[#303568]/60">Spotify</p>
                  <p className="text-sm font-extrabold text-[#303568]">129,00 kr</p>
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
      <ReceiptBackdrop />
      <ReceiptRows rows={RECEIPT.top} />

      {/* ─── SOCIAL PROOF BAR ─── */}
      <Section className="py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "24 h", label: "from forwarded receipt to VAT-ready record" },
              { value: "1", label: "private receipt address for your company" },
              { value: "8", label: "expense categories, sorted for you" },
              { value: "0", label: "bank connections or new cards needed" },
            ].map((stat) => (
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
        <ReceiptTicker />
      </section>

      <ReceiptRows rows={RECEIPT.features} />

      {/* ─── FEATURES — 3 PILLARS ─── */}
      <Section id="features" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">Why UnReceipt</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568]">
              Focus on What Matters
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {[
              {
                icon: Mail,
                title: "One Inbox for Every Receipt",
                desc: "Your company gets a private UnReceipt address. Forward email receipts to it, or snap paper ones with your phone.",
              },
              {
                icon: ReceiptText,
                title: "Every Line, VAT Included",
                desc: "Merchant, date, line items, VAT rate and amount, and the merchant\u2019s VAT number \u2014 read, checked and saved within 24 hours.",
              },
              {
                icon: Search,
                title: "Find Anything, Keep Everything",
                desc: "Receipts sorted by date and category. Open any one to see the original, or download it as a PDF for your accountant.",
              },
            ].map((feature) => (
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

      <ReceiptRows rows={RECEIPT.how} />

      {/* ─── HOW IT WORKS ─── */}
      <Section id="how" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">How it Works</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
              Three Steps. No Setup.
            </h2>
            <p className="text-[#303568]/50 text-lg max-w-2xl mx-auto">
              No bank connection, no new card. Just send us your receipts.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-10 left-[16.67%] right-[16.67%] h-[2px] bg-[#27BE7B]/20" />
            {[
              {
                icon: Mail,
                step: "01",
                title: "Forward or snap",
                desc: "Forward email receipts to your private address, or take a photo of a paper receipt \u2014 the fields fill themselves.",
              },
              {
                icon: CheckCircle2,
                step: "02",
                title: "We check every receipt",
                desc: "Within 24 hours each receipt is read, categorized and its VAT split out, then checked by our concierge.",
              },
              {
                icon: FileText,
                step: "03",
                title: "Ready for your accountant",
                desc: "Every receipt waits in your dashboard, VAT-ready, with the original file and a PDF one click away.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center relative">
                <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-5 relative z-10 shadow-sm">
                  <item.icon className="w-8 h-8 text-[#27BE7B]" />
                </div>
                <div className="text-xs font-bold text-[#27BE7B] mb-2 tracking-widest">
                  STEP {item.step}
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

      <ReceiptRows rows={RECEIPT.difference} />

      {/* ─── COMPARISON ─── */}
      <Section id="difference" className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">The Difference</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
              Paper Fades. Simplicity Stays.
            </h2>
            <p className="text-[#303568]/50 text-lg">
              Why small businesses switch to UnReceipt
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm rounded-3xl bg-[#ECF7E7]">
              <CardContent className="pt-8 pb-8 px-8">
                <h3 className="font-bold mb-6 text-red-400 text-sm uppercase tracking-widest">
                  The old way
                </h3>
                <ul className="space-y-4 text-sm">
                  {[
                    "Paper receipts lost in wallets and cars",
                    "Email receipts buried across inboxes",
                    "Typing amounts and VAT into spreadsheets",
                    "Chasing colleagues for receipts at month-end",
                  ].map((item) => (
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
                  UnReceipt
                </h3>
                <ul className="space-y-4 text-sm">
                  {[
                    "One private address for every receipt",
                    "Paper receipts captured with a photo",
                    "VAT split out and checked for you",
                    "Everything in one dashboard, original included",
                  ].map((item) => (
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

      <ReceiptRows rows={RECEIPT.pricing} />

      {/* ─── PRICING ─── */}
      <Section id="pricing" className="py-20 px-4 sm:px-6">
        <Pricing pilotMode={pilotMode} />
      </Section>

      <ReceiptRows rows={RECEIPT.about} />

      {/* ─── BUILT FOR TEAMS ─── */}
      <Section id="about" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">Who it&apos;s for</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568]">
              Built for Small Teams
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10 md:gap-8">
            {[
              {
                icon: Smartphone,
                title: "For Employees",
                desc: "Forward the email or snap the paper receipt. No forms to fill in, nothing to remember at month-end.",
              },
              {
                icon: Building2,
                title: "For Whoever Does the Books",
                desc: "Every receipt in one place, with merchant, category and VAT ready to hand to your accountant.",
              },
              {
                icon: BarChart3,
                title: "For Owners",
                desc: "See this month\u2019s receipts and spending at a glance, without opening a spreadsheet.",
              },
            ].map((item) => (
              <div key={item.title}>
                <div className="w-14 h-14 rounded-2xl bg-[#27BE7B]/10 flex items-center justify-center mb-5">
                  <item.icon className="w-6 h-6 text-[#27BE7B]" />
                </div>
                <h3 className="font-bold text-[#303568] text-lg mb-3">{item.title}</h3>
                <p className="text-sm text-[#303568]/70 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <ReceiptRows rows={RECEIPT.badges} />

      {/* ─── TRUST BADGES ─── */}
      <Section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: Mail, label: "Private Address per Company" },
              { icon: FileText, label: "Original Always Kept" },
              { icon: Download, label: "PDF for Every Receipt" },
              { icon: CheckCircle2, label: "Cancel Anytime" },
            ].map((badge) => (
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

      <ReceiptRows rows={RECEIPT.end} />
      </div>

      {/* ─── WAITLIST CTA ─── */}
      <section id="waitlist" className="relative bg-[#303568] py-20 px-4 sm:px-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0">
          <ReceiptEdge color="#303568" flip />
        </div>
        {/* Background accents */}
        <div className="absolute inset-0 opacity-[0.05]">
          <div className="absolute top-10 right-20 w-40 h-40 rounded-full border-2 border-white" />
          <div className="absolute bottom-10 left-10 w-32 h-32 rounded-full border-2 border-white" />
        </div>

        <div className="max-w-xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-[#27BE7B]/20 rounded-full px-4 py-1.5 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-[#27BE7B]" />
            <span className="text-[#27BE7B] text-xs font-semibold tracking-wide uppercase">Not in Sweden yet?</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-4 text-white">
            Get notified when we launch in your country
          </h2>
          <p className="text-white/70 text-base mb-10">
            UnReceipt Concierge is in pilot in Sweden today. Drop your email
            and we&apos;ll let you know the moment we open in your market.
          </p>
          {submitted ? (
            <div className="flex items-center justify-center gap-2 text-[#27BE7B] font-semibold text-lg">
              <CheckCircle2 className="w-5 h-5" />
              You&apos;re on the list! We&apos;ll be in touch.
            </div>
          ) : (
            <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="your@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-white/40 rounded-full px-6 h-12 focus:bg-white/15"
              />
              <Button
                type="submit"
                className="bg-[#27BE7B] text-white hover:bg-[#1fa568] rounded-full px-8 font-semibold h-12 shadow-lg shadow-[#27BE7B]/25"
                disabled={submitting}
              >
                {submitting ? "Joining..." : "Notify me"}
                {!submitting && <ArrowRight className="w-4 h-4 ml-1.5" />}
              </Button>
            </form>
          )}
          {waitlistError ? (
            <p role="alert" className="text-sm text-[#FFB4A8] mt-3">
              {waitlistError}
            </p>
          ) : null}
          <p className="text-xs text-white/40 mt-5">
            In Sweden? Skip the list and{" "}
            <a href={appUrl("/app/login")} className="underline hover:text-white">
              {pilotMode ? "join the pilot" : "start your free week"}
            </a>
            .
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#252850] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10">
            <div>
              <Image
                src="/logo-light.png"
                alt="UnReceipt"
                width={180}
                height={50}
                className="h-10 w-auto mb-4"
              />
              <p className="text-sm text-white/40 max-w-xs">
                VAT-ready receipts for small businesses in Sweden. Paper is Past.
              </p>
            </div>
            <div className="flex gap-16">
              <div>
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Product</p>
                <div className="flex flex-col">
                  <a href="#features" className="text-sm text-white/40 hover:text-white transition-colors py-2">Solutions</a>
                  <a href="#pricing" className="text-sm text-white/40 hover:text-white transition-colors py-2">Pricing</a>
                  <a href="#how" className="text-sm text-white/40 hover:text-white transition-colors py-2">How it Works</a>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Company</p>
                <div className="flex flex-col">
                  <a href="#about" className="text-sm text-white/40 hover:text-white transition-colors py-2">About</a>
                  <a href="#waitlist" className="text-sm text-white/40 hover:text-white transition-colors py-2">Contact</a>
                  <a href="/privacy" className="text-sm text-white/40 hover:text-white transition-colors py-2">Privacy</a>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/30">
              &copy; 2026 UnReceipt. All rights reserved.
            </p>
            <p className="text-xs text-white/30">
              Made with precision in Europe.
            </p>
          </div>
        </div>
      </footer>

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
