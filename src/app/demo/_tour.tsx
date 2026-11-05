"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

// Shared chrome for the public guided tours at /demo/company and
// /demo/accountant: one short instruction per step, Back / Next, and a guard
// that keeps clicks inside the demo (links into the real app would land on
// a sign-in page).

export type TourStep = { title: string; text: React.ReactNode };

export function TourBar({
  steps,
  step,
  hrefFor,
}: {
  steps: TourStep[];
  step: number;
  hrefFor: (step: number) => string;
}) {
  const current = steps[step - 1];
  const last = step === steps.length;
  return (
    <div className="bg-card border-b border-[var(--hairline)]">
      <div className="max-w-[1040px] mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className="text-[var(--ink-muted)] uppercase"
            style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em" }}
          >
            Demo · Step {step} of {steps.length}
          </p>
          <h1
            className="font-display font-bold text-[var(--ink)]"
            style={{ fontSize: "18px", lineHeight: 1.3, letterSpacing: "-0.01em" }}
          >
            {current.title}
          </h1>
          <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
            {current.text}
          </p>
        </div>
        <nav aria-label="Demo steps" className="flex items-center gap-2 shrink-0">
          <Link
            href="/demo"
            aria-label="Leave the demo"
            className="inline-flex items-center justify-center h-11 w-11 rounded-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </Link>
          {step > 1 ? (
            <Link
              href={hrefFor(step - 1)}
              className="inline-flex items-center gap-1 h-11 px-4 rounded-[10px] border border-[var(--hairline)] text-[var(--ink)] font-semibold hover:bg-[var(--surface)]"
              style={{ fontSize: "15px" }}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back
            </Link>
          ) : null}
          {!last ? (
            <Link
              href={hrefFor(step + 1)}
              className="inline-flex items-center gap-1 h-11 px-5 rounded-[10px] bg-[var(--ink)] text-[var(--surface)] font-semibold hover:opacity-90"
              style={{ fontSize: "15px" }}
            >
              Next
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      </div>
    </div>
  );
}

/** Stops links into the real app (/app, /firm, /auth) from leaving the demo. */
export function useDemoLinkGuard(): [string | null, () => void] {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      const href = a?.getAttribute("href") ?? "";
      if (/^\/(app|firm|auth|subscribe)(\/|$|\?)/.test(href) || /^\/api\/receipts\/[^/]+\/pdf$/.test(href)) {
        e.preventDefault();
        setNotice("That opens a part of the real app. In the demo, follow the steps above.");
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return [notice, () => setNotice(null)];
}

export function DemoNotice({ notice, onClose }: { notice: string | null; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div role="status" className="bg-[var(--attention-tint)] text-[var(--attention-deep)]">
      <div className="max-w-[1040px] mx-auto px-4 py-2 flex items-center gap-3" style={{ fontSize: "13px", fontWeight: 500 }}>
        <span className="flex-1">{notice}</span>
        <button type="button" onClick={onClose} className="underline min-h-11 px-2">
          OK
        </button>
      </div>
    </div>
  );
}

/** The last step: one sentence and the way into the real product. */
export function TourEnd({
  title,
  text,
  cta,
  ctaHref,
  other,
}: {
  title: string;
  text: string;
  cta: string;
  ctaHref: string;
  other: { label: string; href: string };
}) {
  return (
    <main className="max-w-[540px] mx-auto px-4 pt-16 pb-24 space-y-5">
      <div className="space-y-2">
        <h2
          className="font-display font-bold text-[var(--ink)]"
          style={{ fontSize: "24px", lineHeight: 1.15, letterSpacing: "-0.02em" }}
        >
          {title}
        </h2>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "15px", lineHeight: 1.5 }}>
          {text}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={ctaHref}
          className="inline-flex items-center justify-center h-11 px-5 rounded-[10px] bg-[var(--primary)] text-primary-foreground font-semibold hover:bg-[var(--brand-action-deep)]"
          style={{ fontSize: "15px" }}
        >
          {cta}
        </a>
        <Link href={other.href} className="inline-flex items-center min-h-11 underline text-[var(--ink)]" style={{ fontSize: "15px" }}>
          {other.label}
        </Link>
      </div>
    </main>
  );
}
