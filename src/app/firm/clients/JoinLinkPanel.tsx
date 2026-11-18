"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Link2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecommendText } from "@/lib/firm/recommend";

// "Your firm's link" on /firm/clients (src/lib/firm/join-link.ts): the link
// and its QR code to put on the firm's website, email signature or
// onboarding letter. A client opens it, signs in and says yes; nothing is
// shared before that. Admins can make a new link (every shared or printed
// one stops working) or turn it off.

export type JoinLinkView = {
  url: string | null;
  /** The QR code as a PNG data URL (drawn on the server). */
  qr: string | null;
  /** An admin turned the link off. */
  off: boolean;
  isAdmin: boolean;
  /** The ready Swedish email for clients (src/lib/firm/recommend.ts); null without a link. */
  recommend?: RecommendText | null;
};

export function JoinLinkPanel({ link }: { link: JoinLinkView }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"replace" | "off" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (action: "replace" | "off") => {
    const question =
      action === "replace"
        ? "Make a new link? The current link and QR code stop working, wherever they are shared or printed."
        : "Turn the link off? Nobody can connect with it until you make a new one.";
    if (!window.confirm(question)) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/firm/join-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't change the link. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't change the link. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the link and copy it by hand.");
    }
  };

  return (
    <section aria-labelledby="join-link-title" className="rounded-[12px] border border-[var(--hairline)] bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id="join-link-title" className="flex items-center gap-2 font-display text-[16px] font-bold text-[var(--ink)]">
            <Link2 className="h-4 w-4 text-[var(--ink-muted)]" aria-hidden="true" />
            Your firm&apos;s link
          </h2>
          <p className="type-body text-[var(--ink-muted)]">
            Put it on your website, in your email signature or onboarding letter, or show the QR code at a meeting.
            A client opens it, signs in and says yes: their receipts then appear here.
          </p>
          {link.url ? (
            <>
              <p className="break-all rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 type-caption text-[var(--ink)]" data-testid="join-link-url">
                {link.url}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={() => void copy()}>
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <span className="sr-only" role="status">
                  {copied ? "Link copied" : ""}
                </span>
                {link.qr ? (
                  <a
                    href={link.qr}
                    download="unreceipt-firm-link-qr.png"
                    className={cn(buttonVariants({ variant: "outline" }), "h-11")}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download QR code
                  </a>
                ) : null}
              </div>
            </>
          ) : (
            <p className="type-body text-[var(--ink)]">
              {link.off
                ? "The link is turned off: nobody can connect with it."
                : "The link isn't available right now. Reload the page in a moment."}
            </p>
          )}
          {link.isAdmin && (link.url || link.off) ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <button
                type="button"
                onClick={() => void change("replace")}
                disabled={busy != null}
                className="min-h-11 type-caption text-[var(--ink-muted)] underline hover:text-[var(--ink)] disabled:opacity-60"
              >
                {busy === "replace" ? "Making a new link…" : link.off ? "Turn on with a new link" : "Make a new link"}
              </button>
              {link.url ? (
                <button
                  type="button"
                  onClick={() => void change("off")}
                  disabled={busy != null}
                  className="min-h-11 type-caption text-[var(--ink-muted)] underline hover:text-[var(--ink)] disabled:opacity-60"
                >
                  {busy === "off" ? "Turning off…" : "Turn off"}
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-[10px] bg-[var(--attention-tint)] px-3 py-2 type-body font-semibold text-[var(--attention-deep)]">
              {error}
            </p>
          ) : null}
        </div>
        {link.url && link.qr ? (
          // A picture of a link: white like paper in both themes.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.qr}
            alt={`QR code for your firm's link`}
            width={160}
            height={160}
            className="h-40 w-40 shrink-0 self-center rounded-[10px] border border-[var(--hairline)] bg-[var(--paper)] sm:self-start"
          />
        ) : null}
      </div>
    </section>
  );
}
