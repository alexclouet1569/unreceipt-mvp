"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AccountantLink = {
  id: string;
  firmName: string;
  status: "invited" | "active";
  since: string | null;
};

/**
 * Settings → "Your accountant": pending invites matched by email (Connect /
 * Decline, via POST /api/accountant/respond) and the connected firm
 * (Disconnect, via DELETE /api/accountant/link).
 */
export function AccountantSection({ links }: { links: AccountantLink[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (link: AccountantLink, action: "accept" | "decline" | "disconnect") => {
    setBusy(`${link.id}:${action}`);
    setError(null);
    try {
      const res =
        action === "disconnect"
          ? await fetch("/api/accountant/link", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ linkId: link.id }),
            })
          : await fetch("/api/accountant/respond", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ inviteId: link.id, action }),
            });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const active = links.filter((l) => l.status === "active");
  const pending = links.filter((l) => l.status === "invited");

  return (
    <div className="space-y-3">
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        A connected accounting firm sees your receipts and originals, fills in
        the ones that need review and downloads a monthly export. It can&apos;t
        change your plan or delete anything.
      </p>

      {links.length === 0 ? (
        <p
          className="bg-card text-[var(--ink-muted)]"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px", fontSize: "14px" }}
        >
          No accounting firm connected. When a firm invites you, it shows up
          here and in your email.
        </p>
      ) : (
        <ul
          role="list"
          className="bg-card divide-y divide-[var(--hairline)]"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
        >
          {active.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "12px 14px", minHeight: "56px" }}>
              <span className="min-w-0">
                <span className="block text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
                  {l.firmName}
                </span>
                <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                  Connected{l.since ? ` since ${l.since}` : ""}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => call(l, "disconnect")}
                disabled={busy !== null}
                aria-label={`Disconnect ${l.firmName}`}
              >
                {busy === `${l.id}:disconnect` ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Disconnect
              </Button>
            </li>
          ))}
          {pending.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "12px 14px", minHeight: "56px" }}>
              <span className="min-w-0">
                <span className="block text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
                  {l.firmName}
                </span>
                <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                  Wants to handle your receipts
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  className="h-11"
                  onClick={() => call(l, "accept")}
                  disabled={busy !== null}
                  aria-label={`Connect ${l.firmName}`}
                >
                  {busy === `${l.id}:accept` ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Connect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => call(l, "decline")}
                  disabled={busy !== null}
                  aria-label={`Decline ${l.firmName}`}
                >
                  Decline
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p
          role="alert"
          className="text-sm rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
          style={{ background: "var(--attention-tint)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
