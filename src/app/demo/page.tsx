import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";

// Public guided demo: pick a role, then a short tour of the real screens
// with sample data. Nothing is saved; every /api call is answered in the
// browser (see company/_company-tour.tsx and accountant/_firm-app.tsx).

export const metadata: Metadata = {
  title: "See how it works",
  robots: { index: false, follow: false },
};

const ROLES = [
  {
    href: "/demo/company?step=1",
    title: "I run a company",
    text: "Snap or forward your receipts. Share them with your accountant.",
  },
  {
    href: "/demo/accountant?step=1",
    title: "I'm an accountant",
    text: "Get your clients' receipts, checked and ready for your bookkeeping.",
  },
];

export default function DemoChooser() {
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[540px] mx-auto px-4 pt-12 pb-16 space-y-8">
        <Link href="/demo" aria-label="UnReceipt demo">
          <Wordmark />
        </Link>
        <div className="space-y-2">
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "32px", lineHeight: 1.1, letterSpacing: "-0.02em" }}
          >
            See how it works
          </h1>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            Pick who you are. Two minutes, sample data, nothing is saved.
          </p>
        </div>
        <ul role="list" className="space-y-3">
          {ROLES.map((r) => (
            <li key={r.href}>
              <Link
                href={r.href}
                className="bg-card flex items-center gap-4 hover:bg-[var(--surface)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-display font-bold text-[var(--ink)]" style={{ fontSize: "18px" }}>
                    {r.title}
                  </span>
                  <span className="block text-[var(--ink-muted)] mt-1" style={{ fontSize: "15px", lineHeight: 1.4 }}>
                    {r.text}
                  </span>
                </span>
                <ArrowRight className="w-5 h-5 text-[var(--ink-muted)] shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px" }}>
          Ready already?{" "}
          <a href={appUrl(SIGNUP_PATH)} className="underline text-[var(--ink)]">
            Start free
          </a>
        </p>
      </main>
    </div>
  );
}
