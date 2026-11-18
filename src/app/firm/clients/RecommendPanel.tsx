"use client";

import { useState } from "react";
import { Check, Copy, FileDown, Mail } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLIENT_GUIDE_PATH, type RecommendText } from "@/lib/firm/recommend";

// "Rekommendera UnReceipt till klienter" on /firm/clients (and the
// /demo/accountant tour): a ready Swedish email with the firm's join link
// that the accountant copies into their own mail, and the client guide
// (PDF) to attach or link. Built on the server (src/lib/firm/recommend.ts);
// ClientsView shows it only while the firm's link works (the link card
// above already says when it doesn't).

export function RecommendPanel({ text }: { text: RecommendText }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text.body);
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the text and copy it by hand.");
    }
  };

  return (
    <section aria-labelledby="recommend-title" className="rounded-[12px] border border-[var(--hairline)] bg-card p-4">
      <div className="space-y-3">
        <h2 id="recommend-title" className="flex items-center gap-2 font-display text-[16px] font-bold text-[var(--ink)]">
          <Mail className="h-4 w-4 text-[var(--ink-muted)]" aria-hidden="true" />
          <span lang="sv">Rekommendera UnReceipt till klienter</span>
        </h2>
        <p className="type-body text-[var(--ink-muted)]">
          A ready email in Swedish with your firm&apos;s link. Copy it into your own email to your clients, and
          attach or link the client guide.
        </p>
        <p className="type-caption text-[var(--ink-muted)]">
          Subject:{" "}
          <span lang="sv" className="text-[var(--ink)]" data-testid="recommend-subject">
            {text.subject}
          </span>
        </p>
        {/* A named scroll region on wider screens; on a phone the page
            itself scrolls (no box inside a scrolling page). */}
        <pre
          lang="sv"
          role="region"
          tabIndex={0}
          aria-label="Email text"
          data-testid="recommend-body"
          className="sm:max-h-64 sm:overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] whitespace-pre-wrap break-words rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 font-sans type-caption text-[var(--ink)]"
        >
          {text.body}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy text"}
          </Button>
          <span className="sr-only" role="status">
            {copied ? "Email text copied" : ""}
          </span>
          <a href={CLIENT_GUIDE_PATH} download className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Client guide (PDF, English)
          </a>
        </div>
        {error ? (
          <p role="alert" className="rounded-[10px] bg-[var(--attention-tint)] px-3 py-2 type-body font-semibold text-[var(--attention-deep)]">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
