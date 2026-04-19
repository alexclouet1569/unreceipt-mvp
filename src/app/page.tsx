"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  CheckCircle2,
  Smartphone,
  Building2,
  CreditCard,
  BellRing,
  Camera,
  BarChart3,
  Menu,
  X,
  Infinity,
  FileX2,
  Search,
  Zap,
  Shield,
  Clock,
  Receipt,
  Sparkles,
} from "lucide-react";

/* ── Scroll-reveal hook ── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
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
  const receipts = [
    { merchant: "Restaurant Le Comptoir", amount: "42.50 \u20ac", category: "Meals", status: "matched" },
    { merchant: "Uber Stockholm", amount: "189 kr", category: "Transport", status: "auto" },
    { merchant: "Hotel Scandic", amount: "1,250 kr", category: "Travel", status: "matched" },
    { merchant: "Starbucks", amount: "6.50 \u20ac", category: "Meals", status: "auto" },
    { merchant: "Office Depot", amount: "124.00 \u20ac", category: "Supplies", status: "matched" },
    { merchant: "SAS Airlines", amount: "2,340 kr", category: "Travel", status: "auto" },
    { merchant: "Taxi Kurir", amount: "285 kr", category: "Transport", status: "matched" },
    { merchant: "Coop Konferens", amount: "890 kr", category: "Catering", status: "auto" },
    { merchant: "BP Fuel", amount: "52.30 \u20ac", category: "Fuel", status: "matched" },
    { merchant: "Amazon Business", amount: "199.00 \u20ac", category: "Supplies", status: "auto" },
  ];

  const doubled = [...receipts, ...receipts];

  return (
    <div className="relative overflow-hidden py-6">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10" />

      <div className="flex gap-4 animate-[scroll_30s_linear_infinite]">
        {doubled.map((r, i) => (
          <div
            key={`${r.merchant}-${i}`}
            className="flex-shrink-0 bg-[#ECF7E7] rounded-2xl px-5 py-3.5 flex items-center gap-4 border border-[#27BE7B]/10"
          >
            <div className="w-9 h-9 rounded-xl bg-[#27BE7B]/15 flex items-center justify-center">
              {r.status === "auto" ? (
                <Zap className="w-4 h-4 text-[#27BE7B]" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[#27BE7B]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#303568] whitespace-nowrap">{r.merchant}</p>
              <p className="text-[10px] text-[#303568]/40 uppercase tracking-wider">{r.category}</p>
            </div>
            <div className="text-right pl-3">
              <p className="text-sm font-extrabold text-[#303568] whitespace-nowrap">{r.amount}</p>
              <p className="text-[10px] text-[#27BE7B] font-semibold">
                {r.status === "auto" ? "Auto" : "Matched"}
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
          <Receipt className={`${r.size} text-white`} />
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubmitted(true);
        setEmail("");
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#ECF7E7]">
      {/* ─── NAV ─── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between py-3">
          <Image
            src="/logo-dark.png"
            alt="UnReceipt — automatic expense receipt capture"
            width={180}
            height={50}
            className="h-10 sm:h-11 w-auto"
            priority
          />
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
                className="text-sm font-medium transition-colors text-[#303568]/70 hover:text-[#303568]"
              >
                {link.label}
              </a>
            ))}
            <a href="#waitlist">
              <Button size="sm" className="bg-[#27BE7B] text-white hover:bg-[#1fa568] font-semibold rounded-full px-6 shadow-md shadow-[#27BE7B]/25">
                Join Waitlist
              </Button>
            </a>
          </div>
          <button
            className={`md:hidden p-2 text-[#303568]`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 flex flex-col gap-3 shadow-lg">
            {[
              { label: "Solutions", href: "#features" },
              { label: "How it Works", href: "#how" },
              { label: "Pricing", href: "#pricing" },
              { label: "About", href: "#about" },
            ].map((link) => (
              <a key={link.label} href={link.href} className="text-sm text-[#303568] py-2 font-medium" onClick={() => setMobileMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            <a href="#waitlist" onClick={() => setMobileMenuOpen(false)}>
              <Button className="w-full bg-[#27BE7B] text-white hover:bg-[#1fa568] font-semibold rounded-full">
                Join Waitlist
              </Button>
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
                We catch the receipt at the moment of payment — not weeks later. Your employees never touch an expense report again.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="#waitlist">
                  <Button size="lg" className="bg-[#303568] text-white hover:bg-[#404580] rounded-full px-8 text-base font-semibold shadow-lg shadow-[#303568]/30 h-12">
                    Get Started Free
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </a>
                <a href="#how">
                  <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-[#27BE7B] rounded-full px-8 text-base font-semibold bg-transparent h-12">
                    See How it Works
                  </Button>
                </a>
              </div>
              <p className="text-white/60 text-sm mt-4">Free forever for small teams. No credit card required.</p>
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
                    {/* Notification card */}
                    <div className="p-4 space-y-3">
                      <div className="bg-[#ECF7E7] rounded-2xl p-4 border border-[#27BE7B]/20 animate-[pulseGlow_3s_ease-in-out_infinite]">
                        <div className="flex items-center gap-2 mb-2">
                          <BellRing className="w-4 h-4 text-[#27BE7B]" />
                          <span className="text-[10px] font-semibold text-[#303568]/60 uppercase tracking-wider">Just now</span>
                        </div>
                        <p className="text-sm font-bold text-[#303568]">New expense detected</p>
                        <p className="text-xs text-[#303568]/60 mt-1">Restaurant Le Petit Bistro</p>
                        <p className="text-2xl font-extrabold text-[#27BE7B] mt-2">42.50 &euro;</p>
                      </div>
                      <div className="bg-gray-50 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-[#303568]/60">Today</span>
                          <span className="text-xs font-bold text-[#27BE7B]">3 receipts</span>
                        </div>
                        <div className="space-y-2">
                          {[
                            { name: "Uber", amount: "18.90 \u20ac", time: "14:22" },
                            { name: "Starbucks", amount: "6.50 \u20ac", time: "09:15" },
                            { name: "Office Depot", amount: "124.00 \u20ac", time: "08:30" },
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
                        Snap Receipt
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
                    <span className="text-[10px] font-bold text-[#303568]">Matched</span>
                  </div>
                  <p className="text-xs text-[#303568]/60">Hotel Nordic</p>
                  <p className="text-sm font-extrabold text-[#303568]">285.00 &euro;</p>
                </div>

                <div className="absolute -right-12 bottom-28 bg-white rounded-xl shadow-lg shadow-black/10 p-3 w-32 rotate-[4deg] animate-[float_5s_ease-in-out_infinite_1s]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-[#27BE7B]/10 flex items-center justify-center">
                      <Zap className="w-3 h-3 text-[#27BE7B]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#303568]">Auto</span>
                  </div>
                  <p className="text-xs text-[#303568]/60">Train SJ</p>
                  <p className="text-sm font-extrabold text-[#303568]">89.00 kr</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt edge transition */}
        <div className="absolute bottom-0 left-0 right-0">
          <ReceiptEdge color="#ECF7E7" />
        </div>
      </section>

      {/* ─── SOCIAL PROOF BAR ─── */}
      <Section className="py-10 px-4 sm:px-6 bg-[#ECF7E7]">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "EUR 58", label: "avg. cost per expense report" },
              { value: "50%", label: "of finance teams cite lost receipts as #1 problem" },
              { value: "15 min", label: "spent per expense report by employees" },
              { value: "5 sec", label: "with UnReceipt" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl sm:text-3xl font-extrabold text-[#303568]">{stat.value}</p>
                <p className="text-xs text-[#303568]/50 mt-1 leading-snug">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── RECEIPT TICKER ─── */}
      <section className="bg-white py-4 overflow-hidden">
        <ReceiptTicker />
      </section>

      {/* ─── FEATURES — 3 PILLARS ─── */}
      <Section id="features" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">Why UnReceipt</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568]">
              Focus on What Matters
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Infinity,
                title: "Simplicity Stays",
                desc: "Every receipt turns into a smart, categorized record instantly. Clean, effortless expense management — so you can focus on what truly matters.",
                highlight: false,
              },
              {
                icon: FileX2,
                title: "Zero Paperwork",
                desc: "Simply pay and forget. Your data is saved, organized, and ready for your report without any manual action. Less paper, more power.",
                highlight: true,
              },
              {
                icon: Search,
                title: "Pure Clarity",
                desc: "Access a detailed spending history in seconds. The information you need is always safe at your fingertips, giving you control and peace of mind.",
                highlight: false,
              },
            ].map((feature) => (
              <Card
                key={feature.title}
                className={`border-0 shadow-sm rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                  feature.highlight
                    ? "bg-[#27BE7B] text-white shadow-lg shadow-[#27BE7B]/20"
                    : "bg-[#ECF7E7] text-[#303568]"
                }`}
              >
                <CardContent className="pt-10 pb-10 px-8 text-center">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
                    feature.highlight ? "bg-white/20" : "bg-white"
                  }`}>
                    <feature.icon className={`w-7 h-7 ${feature.highlight ? "text-white" : "text-[#27BE7B]"}`} />
                  </div>
                  <h3 className="font-extrabold text-lg mb-3">
                    {feature.title}
                  </h3>
                  <p className={`text-sm leading-relaxed ${feature.highlight ? "text-white/85" : "text-[#303568]/60"}`}>
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── HOW IT WORKS ─── */}
      <Section id="how" className="py-20 px-4 sm:px-6 bg-[#ECF7E7]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">How it Works</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
              Four Steps. Zero Effort.
            </h2>
            <p className="text-[#303568]/50 text-lg max-w-2xl mx-auto">
              Connect your company bank account. We handle the rest.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-[2px] bg-[#27BE7B]/20" />
            {[
              {
                icon: CreditCard,
                step: "01",
                title: "Employee pays",
                desc: "With any existing corporate card at any POS. No special card needed.",
              },
              {
                icon: BellRing,
                step: "02",
                title: "Instant detection",
                desc: "We detect the payment and send a smart notification with pre-filled details.",
              },
              {
                icon: Camera,
                step: "03",
                title: "One-tap capture",
                desc: "Employee snaps the receipt in 5 seconds — while it\u2019s still in hand.",
              },
              {
                icon: BarChart3,
                step: "04",
                title: "Done",
                desc: "Expense is submitted, matched, and ready for approval. Finance sees it live.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center relative">
                <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center mx-auto mb-5 relative z-10 shadow-sm">
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

      {/* ─── COMPARISON ─── */}
      <Section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">The Difference</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
              Paper Fades. Simplicity Stays.
            </h2>
            <p className="text-[#303568]/50 text-lg">
              Why companies switch to UnReceipt
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm rounded-3xl bg-[#ECF7E7]">
              <CardContent className="pt-8 pb-8 px-8">
                <h3 className="font-bold mb-6 text-red-400 text-sm uppercase tracking-widest">
                  Traditional tools
                </h3>
                <ul className="space-y-4 text-sm">
                  {[
                    "Must switch to their corporate cards",
                    "Employee manually photos every receipt",
                    "Weeks of implementation",
                    "Receipts lost days after payment",
                    "EUR 58 average cost per expense report",
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
                    "Works with any existing corporate card",
                    "Expenses auto-captured from bank feed",
                    "Set up in minutes, not weeks",
                    "Receipt notification within seconds of payment",
                    "One-tap confirmation, everything pre-filled",
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

      {/* ─── PRICING ─── */}
      <Section id="pricing" className="py-20 px-4 sm:px-6 bg-[#ECF7E7]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
              Start Free. Scale When Ready.
            </h2>
            <p className="text-[#303568]/50 text-lg">
              No credit card required. Upgrade when your team grows.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                tier: "Free",
                subtitle: "For small teams",
                price: "0",
                priceLabel: "forever",
                features: [
                  "Up to 10 employees",
                  "Bank account connection",
                  "Smart receipt notifications",
                  "OCR receipt scanning",
                  "Basic expense dashboard",
                ],
                cta: "Get Started Free",
              },
              {
                tier: "Pro",
                subtitle: "For growing companies",
                price: "9",
                priceLabel: "/user/month",
                popular: true,
                features: [
                  "Unlimited employees",
                  "Everything in Free",
                  "Approval workflows",
                  "Expense policy engine",
                  "Accounting integrations",
                  "Analytics & reporting",
                ],
                cta: "Join Waitlist",
              },
              {
                tier: "Enterprise",
                subtitle: "For large organizations",
                price: "Custom",
                priceLabel: "",
                features: [
                  "Everything in Pro",
                  "SSO / SAML",
                  "Multi-entity support",
                  "Dedicated account manager",
                  "Custom integrations",
                  "SLA & priority support",
                ],
                cta: "Contact Us",
              },
            ].map((plan) => (
              <Card
                key={plan.tier}
                className={`border-0 rounded-3xl relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                  plan.popular
                    ? "bg-[#303568] text-white shadow-xl shadow-[#303568]/25 ring-0 md:scale-[1.04]"
                    : "bg-white text-[#303568] shadow-sm"
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-0 right-0 bg-[#27BE7B] text-white text-[10px] font-bold text-center py-1.5 uppercase tracking-[0.2em]">
                    Most Popular
                  </div>
                )}
                <CardContent className={`pb-8 px-7 ${plan.popular ? "pt-12" : "pt-8"}`}>
                  <h3 className="font-bold text-xl">{plan.tier}</h3>
                  <p className={`text-sm mb-5 ${plan.popular ? "text-white/60" : "text-[#303568]/50"}`}>
                    {plan.subtitle}
                  </p>
                  <div className="mb-7">
                    {plan.price === "Custom" ? (
                      <span className="text-4xl font-extrabold">Custom</span>
                    ) : (
                      <>
                        <span className="text-5xl font-extrabold">{plan.price}{plan.price !== "0" && "\u20ac"}</span>
                        <span className={`text-sm ml-1 ${plan.popular ? "text-white/50" : "text-[#303568]/40"}`}>
                          {plan.priceLabel}
                        </span>
                      </>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#27BE7B]" />
                        <span className={plan.popular ? "text-white/80" : ""}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="#waitlist">
                    <Button
                      className={`w-full rounded-full font-semibold h-11 ${
                        plan.popular
                          ? "bg-[#27BE7B] text-white hover:bg-[#1fa568]"
                          : plan.price === "0"
                            ? "bg-[#27BE7B] text-white hover:bg-[#1fa568]"
                            : "bg-[#303568] text-white hover:bg-[#404580]"
                      }`}
                    >
                      {plan.cta}
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── BUILT FOR TEAMS ─── */}
      <Section id="about" className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">Who it&apos;s for</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568]">
              Built for Teams That Move Fast
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Smartphone,
                title: "For Employees",
                desc: "Pay normally. Get a notification. Tap once. Done. No more chasing receipts, filling forms, or remembering to submit.",
              },
              {
                icon: Building2,
                title: "For Finance Teams",
                desc: "Real-time visibility into all company expenses. Automated compliance. No more chasing employees for missing receipts.",
              },
              {
                icon: BarChart3,
                title: "For Leadership",
                desc: "Instant spend analytics. Policy enforcement. Know exactly where your money goes — without waiting for monthly reports.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-[#ECF7E7] rounded-3xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-14 h-14 rounded-2xl bg-[#27BE7B]/10 flex items-center justify-center mb-5">
                  <item.icon className="w-6 h-6 text-[#27BE7B]" />
                </div>
                <h3 className="font-bold text-[#303568] text-lg mb-3">{item.title}</h3>
                <p className="text-sm text-[#303568]/55 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── TRUST BADGES ─── */}
      <Section className="py-16 px-4 sm:px-6 bg-[#ECF7E7]">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: Shield, label: "GDPR Compliant" },
              { icon: Zap, label: "Real-time Processing" },
              { icon: Clock, label: "5-second Capture" },
              { icon: CreditCard, label: "Any Card Works" },
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
            <span className="text-[#27BE7B] text-xs font-semibold tracking-wide uppercase">Free to start</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 text-white">
            Ready to Skip the Slip?
          </h2>
          <p className="text-white/70 text-lg mb-10">
            Join the waitlist. Be among the first companies to eliminate expense report friction — completely free.
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
                {submitting ? "Joining..." : "Join Waitlist"}
                {!submitting && <ArrowRight className="w-4 h-4 ml-1.5" />}
              </Button>
            </form>
          )}
          <p className="text-xs text-white/40 mt-5">
            Free forever for teams up to 10. No credit card required.
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
                alt="UnReceipt — automatic expense receipt capture for businesses"
                width={180}
                height={50}
                className="h-10 w-auto mb-4"
              />
              <p className="text-sm text-white/40 max-w-xs">
                Automatic expense receipt capture for businesses. Paper is Past.
              </p>
            </div>
            <div className="flex gap-16">
              <div>
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4">Product</p>
                <div className="flex flex-col gap-2.5">
                  <a href="#features" className="text-sm text-white/40 hover:text-white transition-colors">Solutions</a>
                  <a href="#pricing" className="text-sm text-white/40 hover:text-white transition-colors">Pricing</a>
                  <a href="#how" className="text-sm text-white/40 hover:text-white transition-colors">How it Works</a>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4">Company</p>
                <div className="flex flex-col gap-2.5">
                  <a href="#about" className="text-sm text-white/40 hover:text-white transition-colors">About</a>
                  <a href="#waitlist" className="text-sm text-white/40 hover:text-white transition-colors">Contact</a>
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
