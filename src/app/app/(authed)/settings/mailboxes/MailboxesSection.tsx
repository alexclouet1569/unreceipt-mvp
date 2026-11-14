"use client";

// Settings → "Connected email": the Gmail / Outlook mailboxes the user
// connected (status in plain words, Reconnect, Disconnect with a confirm
// step) and the connect buttons while under the limit. Forwarding, for
// every other provider, is the "Send us receipts" section right below.
// Disconnect is DELETE /api/mailboxes/<id>, then a refresh so the server's
// list shows. When the answer says the grant wasn't revoked at the provider
// (always for Outlook; a failed Google revoke), the status line also says
// where to remove UnReceipt's access there.
//
// Focus: the confirm step focuses its question (never the destructive
// button); Cancel returns focus to that row's Disconnect; a removal is
// announced in a status line, which then holds focus.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectButtons, OUTLINE_LINK } from "./ConnectButtons";
import {
  PROVIDER_NAME,
  REMOVE_ACCESS_NOTE,
  anyProvider,
  explainerHref,
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
  storeApp = false,
}: {
  providers: MailboxProviders;
  connections: MailboxView[];
  limit: number;
  failed?: boolean;
  // Inside the Capacitor shell: it can't finish an OAuth flow, so a
  // mailbox needing reconnection says where to do it instead.
  storeApp?: boolean;
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
  // "Disconnected anna@gmail.com", in a status line that is always there
  // (a live region must exist before its text changes to be announced).
  const [announcement, setAnnouncement] = useState("");
  // Where to remove access at the provider, after a disconnect that couldn't.
  const [accessNote, setAccessNote] = useState<string | null>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const disconnectRefs = useRef(new Map<string, HTMLButtonElement>());
  // The row whose Disconnect gets focus back after Cancel.
  const returnFocusTo = useRef<string | null>(null);

  useEffect(() => {
    if (confirming) {
      questionRef.current?.focus();
    } else if (returnFocusTo.current) {
      disconnectRefs.current.get(returnFocusTo.current)?.focus();
      returnFocusTo.current = null;
    }
  }, [confirming]);

  useEffect(() => {
    if (announcement) announcementRef.current?.focus();
  }, [announcement]);

  const shown = connections.filter((c) => !removed.has(c.id));
  const canConnect = anyProvider(providers);
  const atLimit = shown.length >= limit;

  const disconnect = async (conn: MailboxView) => {
    setBusy(conn.id);
    setError(null);
    setAnnouncement("");
    setAccessNote(null);
    try {
      const res = await fetch(`/api/mailboxes/${encodeURIComponent(conn.id)}`, { method: "DELETE" });
      // 404: already gone (another tab); the refresh shows the truth.
      if (!res.ok && res.status !== 404) {
        setError(`Couldn’t disconnect ${conn.email}. Try again.`);
        return;
      }
      const body = res.ok ? ((await res.json().catch(() => null)) as { revoked?: unknown } | null) : null;
      setRemoved((prev) => new Set(prev).add(conn.id));
      setConfirming(null);
      setAccessNote(body?.revoked === false ? REMOVE_ACCESS_NOTE[conn.provider] : null);
      setAnnouncement(`Disconnected ${conn.email}`);
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
        {canConnect ? " Other email, like iCloud or Yahoo: forward it to the address below." : null}
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
                    <span className="block type-body font-semibold text-[var(--ink)] [overflow-wrap:anywhere]">
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
                    <p ref={questionRef} tabIndex={-1} className="type-caption text-[var(--ink)] outline-none">
                      Disconnect {conn.email}? Receipts already saved stay. New ones stop arriving.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1"
                        onClick={() => {
                          returnFocusTo.current = conn.id;
                          setConfirming(null);
                        }}
                        disabled={isBusy}
                      >
                        Cancel
                      </Button>
                      <Button
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
                  <div className="space-y-2">
                    {conn.status === "needs_reconnect" && storeApp ? (
                      <p className="type-caption text-[var(--ink-muted)]">
                        Reconnect on app.unreceipt.com in your browser.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {conn.status === "needs_reconnect" && !storeApp && providers[conn.provider] ? (
                        // Through the explainer, like a first connection: it
                        // says what we read before the provider's screen.
                        <Link
                          href={explainerHref(conn.provider, { reconnect: true })}
                          className={cn(OUTLINE_LINK, "h-11")}
                          aria-label={`Reconnect ${conn.email}`}
                        >
                          Reconnect
                        </Link>
                      ) : null}
                      {/* Ink outline like "Stop sharing": the red is kept for
                          the confirm step. */}
                      <Button
                        ref={(el) => {
                          if (el) disconnectRefs.current.set(conn.id, el);
                          else disconnectRefs.current.delete(conn.id);
                        }}
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => {
                          setError(null);
                          setAnnouncement("");
                          setConfirming(conn.id);
                        }}
                        disabled={busy !== null}
                        aria-label={`Disconnect ${conn.email}`}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p
        ref={announcementRef}
        role="status"
        tabIndex={-1}
        className={announcement ? "type-caption text-[var(--ink-muted)] outline-none" : "sr-only"}
      >
        {announcement}
        {announcement && accessNote ? <span className="mt-1 block">{accessNote}</span> : null}
      </p>

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
            <p className="type-caption font-semibold text-[var(--ink)]">
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

    </div>
  );
}
