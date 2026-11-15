"use client";

// "Share your receipts with <firm>?" from a firm's join link: one question,
// who runs the firm (its admin's email domain, so a look-alike name gives
// itself away), and Yes / Not now. Everything else is one sentence and the
// way back to the receipts.

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConnectState } from "@/lib/firm/connect";
import type { AdminDomain } from "@/lib/firm/join-link";

export type ConnectView =
  | { state: { kind: "missing" } | { kind: "error" } }
  | { firmName: string; adminDomain: AdminDomain; state: ConnectState };

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="type-display-lg text-[var(--ink)]">{children}</h1>;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Title>{title}</Title>
      <p className="type-body text-[var(--ink-muted)]">{children}</p>
      <Link href="/app" className="inline-flex min-h-11 items-center type-body text-[var(--ink)] underline">
        Go to your receipts
      </Link>
    </div>
  );
}

function WhoRunsIt({ domain }: { domain: AdminDomain }) {
  if (!domain) return null;
  return (
    <p className="type-caption text-[var(--ink-muted)]">
      {domain.personal
        ? `Its administrator uses a personal ${domain.domain} address. Make sure this is your accountant before you share.`
        : `Its administrator's email is at ${domain.domain}.`}
    </p>
  );
}

export function ConnectCard({
  view,
  code,
  email,
  appUrl,
}: {
  view: ConnectView;
  code: string;
  email: string | null;
  appUrl: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!("firmName" in view)) {
    return view.state.kind === "error" ? (
      <Notice title="Something went wrong">We couldn&apos;t open this link. Reload the page in a moment.</Notice>
    ) : (
      <Notice title="This link doesn't work">It may have been replaced or turned off. Ask your accountant for their current link.</Notice>
    );
  }
  const { firmName, state } = view;

  if (done || state.kind === "already") {
    return (
      <div className="space-y-3" role="status">
        <Title>{done ? `${firmName} now sees your receipts` : `You already share with ${firmName}`}</Title>
        <p className="type-body text-[var(--ink-muted)]">
          You can stop sharing any time in Settings → Your accountant.
        </p>
        {appUrl ? (
          <p className="type-body text-[var(--ink-muted)]">
            On iPhone?{" "}
            <a href={appUrl} className="text-[var(--ink)] underline">
              Get the UnReceipt app
            </a>
            .
          </p>
        ) : null}
        <Link href="/app" className="inline-flex min-h-11 items-center type-body font-semibold text-[var(--ink)] underline">
          Go to your receipts
        </Link>
      </div>
    );
  }
  if (state.kind === "own_firm") {
    return (
      <Notice title="This is your firm's own link">
        Share it with your clients: they open it, sign in and say yes. Your clients and the link are under Clients.
      </Notice>
    );
  }
  if (state.kind === "other_firm") {
    return (
      <Notice title={`You already share with ${state.firmName}`}>
        A company shares its receipts with one accounting firm. To switch to {firmName}, stop sharing with{" "}
        {state.firmName} in Settings → Your accountant first, then open this link again.
      </Notice>
    );
  }

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/firm-connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.ok) {
        setDone(true);
        return;
      }
      setError(
        res.status === 404
          ? "This link doesn't work any more. Ask your accountant for their current link."
          : res.status === 401
            ? "You were signed out. Sign in again and open the link once more."
            : res.status === 429
              ? "Too many tries. Wait a few minutes and try again."
              : (body.message ?? "Couldn't connect. Try again."),
      );
    } catch {
      setError("Couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Title>Share your receipts with {firmName}?</Title>
        <p className="type-body text-[var(--ink-muted)]">
          They&apos;ll see your company&apos;s receipts and do your bookkeeping. Receipts read from a connected
          mailbox show only once you confirm them. You can stop sharing any time.
        </p>
        <WhoRunsIt domain={view.adminDomain} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" onClick={() => void share()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Yes, share
        </Button>
        <Link
          href="/app"
          className="inline-flex h-11 items-center rounded-[10px] border border-[var(--hairline)] px-4 type-body font-semibold text-[var(--ink)]"
        >
          Not now
        </Link>
      </div>
      {error ? (
        <p role="alert" className="rounded-[10px] bg-[var(--attention-tint)] px-3 py-2 type-body font-semibold text-[var(--attention-deep)]">
          {error}
        </p>
      ) : null}
      <p className="type-caption text-[var(--ink-muted)]">
        For {state.companyName ?? "your company"}
        {email ? ` · signed in as ${email}` : ""}
      </p>
    </div>
  );
}
