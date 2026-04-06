"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  Zap,
  Shield,
  Clock,
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
} from "lucide-react";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Receipt className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg tracking-tight">
              UnReceipt
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <Link href="/demo/employee">
              <Button variant="outline" size="sm">
                Live Demo
              </Button>
            </Link>
            <a href="#waitlist">
              <Button size="sm">Join Waitlist</Button>
            </a>
          </div>
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-3">
            <a href="#how-it-works" className="text-sm py-2" onClick={() => setMobileMenuOpen(false)}>How it works</a>
            <a href="#features" className="text-sm py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#pricing" className="text-sm py-2" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <Link href="/demo/employee" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="outline" className="w-full">Live Demo</Button>
            </Link>
            <a href="#waitlist" onClick={() => setMobileMenuOpen(false)}>
              <Button className="w-full">Join Waitlist</Button>
            </a>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium">
            Paper is Past
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            The Cleanest Way to{" "}
            <span className="text-primary">Track Spending</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Your employees pay with their existing cards. We capture the expense
            automatically. No card switch, no manual entry, no lost receipts.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/demo/employee">
              <Button size="lg" className="gap-2 px-8 text-base">
                Try the Demo <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="px-8 text-base">
                See How It Works
              </Button>
            </a>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            No signup required — explore the live prototype
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-muted/50 py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "< 5 min", label: "Avg. receipt capture" },
            { value: "94%", label: "Receipt compliance" },
            { value: "EUR 58", label: "Saved per expense report" },
            { value: "0", label: "Cards to switch" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl sm:text-3xl font-bold text-primary">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              From Chaos to Clarity — Automatically
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Connect your company bank account. We handle the rest.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                icon: CreditCard,
                step: "01",
                title: "Employee pays",
                desc: "With any existing corporate card at any POS counter. No special card needed.",
              },
              {
                icon: BellRing,
                step: "02",
                title: "Instant notification",
                desc: "Within minutes, we detect the payment and send a smart notification with pre-filled details.",
              },
              {
                icon: Camera,
                step: "03",
                title: "One-tap capture",
                desc: "Employee snaps the receipt while it's still in their pocket. Everything else is auto-filled.",
              },
              {
                icon: BarChart3,
                step: "04",
                title: "Done",
                desc: "Expense is submitted, matched, and ready for approval. Finance sees it in real-time.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="text-xs font-mono text-primary mb-2">
                  STEP {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value pillars */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              One Payment. Zero Paperwork.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              The effortless future of expense reports.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "Simplicity Stays",
                desc: "Every receipt turns into a smart, categorized record instantly. Clean, effortless expense management, allowing you to focus on what truly matters.",
              },
              {
                icon: Clock,
                title: "Zero Paperwork",
                desc: "Complete automation. Simply pay and forget. Your data is saved, organized, and ready for your report without any manual action. Less paper, more power.",
              },
              {
                icon: Shield,
                title: "Pure Clarity",
                desc: "Total transparency. Access a detailed and organized spending history in seconds. The information you need is always safe and at your fingertips.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="border-border/50 bg-card">
                <CardContent className="pt-8 pb-6 px-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Skip the Slip
            </h2>
            <p className="text-muted-foreground text-lg">
              Why companies switch to UnReceipt
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="pt-6 pb-6 px-6">
                <h3 className="font-semibold mb-4 text-destructive">
                  Traditional expense tools
                </h3>
                <ul className="space-y-3 text-sm">
                  {[
                    "Must switch to their corporate cards",
                    "Employee manually photos every receipt",
                    "Weeks of implementation",
                    "Receipts lost days after payment",
                    "EUR 58 average cost per expense report",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-muted-foreground">
                      <X className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6 pb-6 px-6">
                <h3 className="font-semibold mb-4 text-primary">UnReceipt</h3>
                <ul className="space-y-3 text-sm">
                  {[
                    "Works with any existing corporate card",
                    "Expenses auto-captured from bank feed",
                    "Set up in minutes, not weeks",
                    "Receipt notification within 5 minutes of payment",
                    "One-tap confirmation, everything pre-filled",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simple Pricing, No Surprises
            </h2>
            <p className="text-muted-foreground text-lg">
              Seat-based SaaS. Scales with your company.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                tier: "Starter",
                employees: "10 - 50",
                price: "6",
                features: [
                  "Bank account connection",
                  "Smart receipt notifications",
                  "OCR receipt scanning",
                  "Basic expense dashboard",
                  "CSV export",
                ],
              },
              {
                tier: "Growth",
                employees: "51 - 250",
                price: "9",
                popular: true,
                features: [
                  "Everything in Starter",
                  "Approval workflows",
                  "Expense policy engine",
                  "Accounting integrations",
                  "Analytics & reporting",
                ],
              },
              {
                tier: "Enterprise",
                employees: "251 - 1000+",
                price: "12",
                features: [
                  "Everything in Growth",
                  "SSO / SAML",
                  "Multi-entity support",
                  "Dedicated account manager",
                  "Custom integrations",
                ],
              },
            ].map((plan) => (
              <Card
                key={plan.tier}
                className={
                  plan.popular
                    ? "border-primary shadow-lg relative"
                    : "border-border/50"
                }
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="px-3">Most Popular</Badge>
                  </div>
                )}
                <CardContent className="pt-8 pb-6 px-6">
                  <h3 className="font-semibold text-lg">{plan.tier}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {plan.employees} employees
                  </p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{plan.price}&euro;</span>
                    <span className="text-muted-foreground text-sm">
                      /employee/month
                    </span>
                  </div>
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href="#waitlist">
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
                    >
                      Join Waitlist
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* For who */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
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
              <div key={item.title} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="waitlist" className="py-20 px-4 sm:px-6 bg-muted/30">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Skip the Slip?
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join the waitlist. Be among the first companies to eliminate expense
            report friction.
          </p>
          {submitted ? (
            <div className="flex items-center justify-center gap-2 text-primary font-medium">
              <CheckCircle2 className="w-5 h-5" />
              You&apos;re on the list! We&apos;ll be in touch.
            </div>
          ) : (
            <form
              onSubmit={handleWaitlist}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <Input
                type="email"
                placeholder="your@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1"
              />
              <Button type="submit" className="gap-2" disabled={submitting}>
                {submitting ? "Joining..." : "Join Waitlist"}{" "}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Free to join. No credit card required.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Receipt className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium">UnReceipt</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; 2026 UnReceipt. Paper is Past.
          </p>
          <div className="flex gap-6">
            <Link
              href="/demo/employee"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Employee Demo
            </Link>
            <Link
              href="/demo/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Finance Demo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
