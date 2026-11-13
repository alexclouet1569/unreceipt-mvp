"use client";

// Settings → "Your email": the Gmail / Outlook mailboxes the user connected
// (status in plain words, Reconnect, Disconnect with a confirm step), the
// connect buttons while under the limit, and the way to forwarding for
// every other provider. Disconnect is DELETE /api/mailboxes/<id>, then a
// refresh so the server's list shows.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectButtons, OUTLINE_LINK } from "./ConnectButtons";
import {
  PROVIDER_NAME,
  anyProvider,
  connectHref,
  statusLine,
  type MailboxProviders,
  type MailboxView,
} from "./copy";

// A clock that ticks once a minute; the snapshot is the minute, so it stays
// the same between ticks.
function subscribeMinute(onTick: () => void): () => void {
  const timer = setInterval(onTick, 60_000);
  return () => clearInterval(timer);
}
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

export function MailboxesSection({
  providers,
  connections,
  limit,
  failed = false,
}: {
  providers: MailboxProviders;
  connections: MailboxView[];
  limit: number;
  failed?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rows gone from the screen at once; the refresh brings the server's list.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  // "2 h ago" is worked out in the browser only (null on the server), so
  // the server's clock and the browser's never disagree in the markup.
  const now = useSyncExternalStore(subscribeMinute, currentMinute, () => null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const shown = connections.filter((c) => !removed.has(c.id));
  const canConnect = anyProvider(providers);
  const atLimit = shown.length >= limit;

  const disconnect = async (conn: MailboxView) => {
    setBusy(conn.id);
    setError(null);
    try {
      const res = await fetch(`/api/mailboxes/${encodeURIComponent(conn.id)}`, { method: "DELETE" });
      // 404: already gone (another tab); the refresh shows the truth.
      if (!res.ok && res.status !== 404) {
        setError(`Couldn’t disconnect ${conn.email}. Try again.`);
        return;
      }
      setRemoved((prev) => new Set(prev).add(conn.id));
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Couldn’t disconnect. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="type-caption text-[var(--ink-muted)]">
        Connect your inbox once and receipts arrive by themselves. They land
        under Review needed for you to check.
      </p>

      {failed ? (
        <p
          role="alert"
          className="type-caption rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
          style={{ background: "var(--attention-tint)" }}
        >
          Couldn&apos;t load your connected mailboxes. Reload the page to try again.
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul
          role="list"
          aria-label="Connected mailboxes"
          className="bg-card divide-y divide-[var(--hairline)]"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
        >
          {shown.map((conn) => {
            const status = statusLine(conn, now ?? undefined);
            const isConfirming = confirming === conn.id;
            const isBusy = busy === conn.id;
            return (
              <li key={conn.id} style={{ padding: "12px 14px" }} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface)] text-[var(--ink-muted)]"
                    style={{ border: "1px solid var(--hairline)" }}
                  >
                    <Mail className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[var(--ink)] [overflow-wrap:anywhere]">
                      {conn.email}
                    </span>
                    <span className="block type-caption text-[var(--ink-muted)]">
                      {PROVIDER_NAME[conn.provider]} ·{" "}
                      <span
                        className={cn(
                          status.tone === "attention" && "font-semibold text-[var(--attention-deep)]",
                        )}
                      >
                        {/* Until the browser's clock is known, no "ago". */}
                        {now === null && status.tone === "ok" ? "Watching for receipts" : status.text}
                      </span>
                    </span>
                  </span>
                </div>

                {isConfirming ? (
                  <div className="space-y-2">
                    <p className="type-caption text-[var(--ink)]">
                      Disconnect {conn.email}? Receipts already saved stay. New ones stop arriving.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1"
                        onClick={() => setConfirming(null)}
                        disabled={isBusy}
                      >
                        Cancel
                      </Button>
                      <Button
                        ref={confirmRef}
                        type="button"
                        className="h-11 flex-1 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => disconnect(conn)}
                        disabled={isBusy}
                        aria-label={`Confirm: disconnect ${conn.email}`}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        {isBusy ? "Disconnecting…" : "Disconnect"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {conn.status !== "active" && providers[conn.provider] ? (
                      // A plain link: the connect route answers with a
                      // redirect to the provider, which a form POST can't follow.
                      <a
                        href={connectHref(conn.provider)}
                        className={cn(OUTLINE_LINK, "h-11")}
                        aria-label={`Reconnect ${conn.email}`}
                      >
                        Reconnect
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 text-[var(--negative)] hover:text-[var(--negative)]"
                      onClick={() => {
                        setError(null);
                        setConfirming(conn.id);
                      }}
                      disabled={busy !== null}
                      aria-label={`Disconnect ${conn.email}`}
                    >
                      Disconnect
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="type-caption rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
          style={{ background: "var(--attention-tint)" }}
        >
          {error}
        </p>
      ) : null}

      {canConnect && !atLimit ? (
        <div className="space-y-2">
          {shown.length > 0 ? (
            <p className="type-caption text-[var(--ink)]" style={{ fontWeight: 600 }}>
              Add another mailbox
            </p>
          ) : null}
          <ConnectButtons providers={providers} />
        </div>
      ) : null}
      {canConnect && atLimit ? (
        <p className="type-caption text-[var(--ink-muted)]">
          {limit} mailboxes is the most you can connect. Disconnect one to add another.
        </p>
      ) : null}

      <Link
        href="/app/settings/forwarding"
        className="flex items-center justify-between gap-3 rounded-[10px] text-[var(--ink-muted)] outline-none transition-colors duration-100 hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        style={{ minHeight: "44px" }}
      >
        <span className="type-caption">
          {canConnect || shown.length > 0
            ? "Other email (iCloud, Yahoo…)? Forward instead"
            : "Forward your email receipts, from any provider"}
        </span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
      </Link>
    </div>
  );
}
