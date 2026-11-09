"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/Switch";

export type AccountantLink = {
  id: string;
  firmName: string;
  // invited: a firm asked us. sent: we asked an accountant (firmName is
  // then the address it went to). active: the firm sees our receipts.
  status: "invited" | "active" | "sent";
  since: string | null;
  // Active links: the Monday reminder email from the firm. optedOut is the
  // client's own choice (this page); firmOn the firm's switch.
  reminders?: { optedOut: boolean; firmOn: boolean };
};

/**
 * Settings → "Your accountant": invite your accountant by email (POST
 * /api/accountant/invite), firm invites matched by email (Yes, share / No
 * thanks, via POST /api/accountant/respond), and the connected firm or the
 * invite still waiting (Stop sharing / Withdraw, via DELETE
 * /api/accountant/link).
 */
export function AccountantSection({ links }: { links: AccountantLink[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("invite");
    setError(null);
    try {
      const res = await fetch("/api/accountant/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't send the invite. Try again.");
        return;
      }
      setSentTo(email.trim());
      setEmail("");
      router.refresh();
    } catch {
      setError("Couldn't send. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

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

  const setReminders = async (link: AccountantLink, on: boolean) => {
    if (busy) return;
    setBusy(`${link.id}:reminders`);
    setError(null);
    try {
      const res = await fetch("/api/accountant/link", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkId: link.id, weeklyReminders: on }),
      });
      if (!res.ok) {
        setError("Couldn't save. Try again.");
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
  const sent = links.filter((l) => l.status === "sent");
  const canInvite = active.length === 0 && sent.length === 0;

  return (
    <div className="space-y-3">
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.4 }}>
        Your accountant sees all your receipts and does your bookkeeping.
      </p>

      {links.length === 0 ? null : (
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
                  Sees your receipts{l.since ? ` since ${l.since}` : ""}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => call(l, "disconnect")}
                disabled={busy !== null}
                aria-label={`Stop sharing with ${l.firmName}`}
              >
                {busy === `${l.id}:disconnect` ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Stop sharing
              </Button>
              {l.reminders ? (
                <div className="flex w-full items-center justify-between gap-3 border-t border-[var(--hairline)] pt-2">
                  <span className="min-w-0">
                    <span id={`reminders-${l.id}`} className="block text-[var(--ink)]" style={{ fontSize: "14px", fontWeight: 600 }}>
                      Weekly reminder from {l.firmName}
                    </span>
                    <span id={`reminders-${l.id}-desc`} className="block text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.4 }}>
                      {l.reminders.optedOut
                        ? "Off. Your accountant can still email you when something is missing."
                        : l.reminders.firmOn
                          ? "On Mondays, an email listing missing receipts, when there are any."
                          : "Your accountant has turned it off for now."}
                    </span>
                  </span>
                  <Switch
                    checked={!l.reminders.optedOut}
                    onClick={() => setReminders(l, l.reminders!.optedOut)}
                    labelledBy={`reminders-${l.id}`}
                    describedBy={`reminders-${l.id}-desc`}
                    busy={busy !== null}
                  />
                </div>
              ) : null}
            </li>
          ))}
          {sent.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "12px 14px", minHeight: "56px" }}>
              <span className="min-w-0">
                <span className="block text-[var(--ink)] break-all" style={{ fontSize: "15px", fontWeight: 600 }}>
                  {l.firmName}
                </span>
                <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                  Invite sent · waiting for them
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => call(l, "disconnect")}
                disabled={busy !== null}
                aria-label={`Withdraw the invite to ${l.firmName}`}
              >
                {busy === `${l.id}:disconnect` ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Withdraw
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
                  Wants to see your receipts
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  className="h-11"
                  onClick={() => call(l, "accept")}
                  disabled={busy !== null}
                  aria-label={`Share your receipts with ${l.firmName}`}
                >
                  {busy === `${l.id}:accept` ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Yes, share
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => call(l, "decline")}
                  disabled={busy !== null}
                  aria-label={`No thanks: ${l.firmName}`}
                >
                  No thanks
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canInvite ? (
        <form
          onSubmit={invite}
          className="bg-card space-y-3"
          style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
        >
          <label className="block space-y-1">
            <span className="block text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
              Invite your accountant
            </span>
            <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
              They get an email and accept with that address.
            </span>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accountant@firm.se"
              className="w-full h-11 rounded-[6px] border border-[var(--hairline)] bg-card px-3 text-[16px] text-[var(--ink)] outline-none focus:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50"
            />
          </label>
          <Button type="submit" variant="outline" className="h-11" disabled={busy !== null || email.trim().length < 3}>
            {busy === "invite" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Send invite
          </Button>
        </form>
      ) : null}
      {sentTo ? (
        <p role="status" className="text-[var(--ink)]" style={{ fontSize: "13px" }}>
          Invite sent to {sentTo}.
        </p>
      ) : null}

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
