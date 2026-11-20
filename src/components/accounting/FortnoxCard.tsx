"use client";

// "Fortnox" in Settings (an owner) and on a client's page in the firm portal
// (the firm's staff, `org` = the client): connect the company's Fortnox,
// choose the voucher series and the accounts payments come from, and
// disconnect. The booking agent then proposes a voucher for every confirmed
// receipt (src/lib/accounting/), which a person approves.
//
// Connect is a plain link (the CSP's form-action 'self' would block a form
// POST that redirects to Fortnox). Everything is checked again server-side.
// Outline buttons only: in Settings, as every section; the green stays the
// receipt sheet's Approve.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/receipt/BookingPanel";
import { cn } from "@/lib/utils";

export type FortnoxCardSummary = {
  configured: boolean;
  connection: {
    status: "active" | "needs_reconnect";
    companyName: string | null;
    orgNumber: string | null;
    confirmed: boolean;
    grantId: string;
  } | null;
};

type Settings = {
  voucherSeries: string | null;
  creditAccountCompany: string | null;
  creditAccountEmployee: string | null;
  vatStatus: "full" | "none" | "partial" | null;
};
type Options = { voucherSeries: string[]; paymentAccounts: Array<{ number: string; name: string }> } | null;

// As the mailbox Connect buttons (settings/mailboxes/ConnectButtons.tsx).
const OUTLINE_LINK =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border border-[var(--hairline)] bg-card px-4 type-body font-semibold text-[var(--ink)] outline-none transition-colors duration-100 hover:bg-[var(--surface)] focus-visible:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50";

export function FortnoxCard({
  org,
  summary,
  result,
  variant = "settings",
}: {
  /** The client's organisation id in the firm portal; null for the owner's own company. */
  org: string | null;
  summary: FortnoxCardSummary;
  result?: { ok: boolean; text: string } | null;
  /** "settings": a section of /app/settings (micro label above the card); "firm": a card of the client page. */
  variant?: "settings" | "firm";
}) {
  const router = useRouter();
  const query = org ? `?org=${encodeURIComponent(org)}` : "";
  const conn = summary.connection;
  const active = conn?.status === "active";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [options, setOptions] = useState<Options>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<"save" | "disconnect" | "confirm" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(result ?? null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounting/settings${query}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as { settings: Settings; options: Options };
    } catch {
      return null;
    }
  }, [query]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadSettings().then((body) => {
      if (!alive) return;
      if (!body || !body.options) {
        setLoadState("error");
        return;
      }
      setSettings(body.settings);
      setOptions(body.options);
      setLoadState("ready");
    });
    return () => {
      alive = false;
    };
  }, [active, loadSettings]);

  if (!summary.configured) return null;

  const retry = async () => {
    setLoadState("loading");
    const body = await loadSettings();
    if (!body || !body.options) {
      setLoadState("error");
      return;
    }
    setSettings(body.settings);
    setOptions(body.options);
    setLoadState("ready");
  };

  const save = async () => {
    if (!settings) return;
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch(`/api/accounting/settings${query}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      setMessage(
        res.ok
          ? { ok: true, text: "Saved." }
          : { ok: false, text: res.status === 422 ? "That series or account isn't active in Fortnox." : "Couldn't save. Try again." },
      );
    } catch {
      setMessage({ ok: false, text: "Couldn't save. Check your connection." });
    }
    setBusy(null);
  };

  const confirmCompany = async () => {
    setBusy("confirm");
    setMessage(null);
    try {
      const res = await fetch(`/api/accounting/fortnox${query}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, grantId: conn?.grantId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMessage({ ok: true, text: "Confirmed. Receipts can now be booked." });
        router.refresh();
      } else if (body.error === "company_taken") {
        setMessage({ ok: false, text: "That Fortnox company is already connected to another company in UnReceipt. Disconnect and connect the right one." });
      } else if (body.error === "changed") {
        setMessage({ ok: false, text: "Fortnox was reconnected meanwhile. Reload the page and check the company again." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: "Couldn't confirm. Try again." });
      }
    } catch {
      setMessage({ ok: false, text: "Couldn't confirm. Check your connection." });
    }
    setBusy(null);
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setMessage(null);
    try {
      const res = await fetch(`/api/accounting/fortnox${query}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { revoked?: boolean };
      if (!res.ok) {
        setMessage({ ok: false, text: "Couldn't disconnect. Try again." });
      } else {
        setConfirming(false);
        setMessage({
          ok: true,
          text: body.revoked
            ? "Fortnox is disconnected."
            : "Disconnected: UnReceipt no longer books for this company. To end the permission in Fortnox too, remove UnReceipt under Integrationer in Fortnox.",
        });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Couldn't disconnect. Check your connection." });
    }
    setBusy(null);
  };

  const field = (key: keyof Settings, label: string, choices: Array<{ value: string; label: string }>) => (
    <label className="block space-y-1">
      <span className="block type-caption font-semibold text-[var(--ink-muted)]">{label}</span>
      <select
        className={FIELD_CLASS}
        value={settings?.[key] ?? ""}
        onChange={(e) => setSettings((s) => (s ? { ...s, [key]: e.target.value || null } : s))}
      >
        <option value="">Choose…</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );

  const accountChoices = (options?.paymentAccounts ?? []).map((a) => ({ value: a.number, label: `${a.number} ${a.name}` }));
  const titleId = `fortnox-card-title${org ? `-${org}` : ""}`;

  const body = (
    <>
      <p className="type-body text-[var(--ink-muted)]">
        {conn
          ? active
            ? conn.confirmed
              ? `Connected to ${conn.companyName ?? "a Fortnox company"}${conn.orgNumber ? ` (${conn.orgNumber})` : ""}. Every confirmed receipt gets a proposed voucher; nothing is booked until a person approves it.`
              : "Fortnox is connected. One last check before anything is booked:"
            : "The connection has expired. Connect again to keep booking receipts."
          : "Connect the company's Fortnox: UnReceipt proposes a voucher for every confirmed receipt, with the receipt attached, and books it when a person approves. A system administrator in Fortnox approves the connection."}
      </p>

      {!active ? (
        <a href={`/api/accounting/fortnox/connect${query}`} className={cn(OUTLINE_LINK, "w-full")} data-testid="fortnox-connect">
          <Link2 className="w-4 h-4" aria-hidden="true" />
          {conn ? "Reconnect Fortnox" : "Connect Fortnox"}
        </a>
      ) : !conn?.confirmed ? (
        <div className="space-y-2" role="group" aria-label="Confirm the Fortnox company">
          <p className="type-body font-semibold text-[var(--attention-deep)]">
            Book into {conn?.companyName ?? "this Fortnox company"}
            {conn?.orgNumber ? ` (${conn.orgNumber})` : ""}?
          </p>
          <p className="type-body text-[var(--ink)]">
            UnReceipt couldn&apos;t check the org number. Confirm it is this company&apos;s Fortnox before anything is booked; if not,
            disconnect and connect the right one.
          </p>
          <Button type="button" variant="outline" className="w-full h-11" onClick={confirmCompany} disabled={busy !== null}>
            {busy === "confirm" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
            Yes, this is the right company
          </Button>
        </div>
      ) : loadState === "loading" ? (
        <div className="space-y-3" aria-hidden="true">
          <div className="skeleton h-11 w-full rounded-[10px]" />
          <div className="skeleton h-11 w-full rounded-[10px]" />
          <div className="skeleton h-11 w-full rounded-[10px]" />
        </div>
      ) : loadState === "error" ? (
        <div className="space-y-2">
          <p role="alert" className="type-body font-semibold text-[var(--attention-deep)]">
            Couldn&apos;t read the settings from Fortnox.
          </p>
          <Button type="button" variant="outline" className="w-full h-11 gap-1.5" onClick={retry}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {field(
            "voucherSeries",
            "Voucher series",
            (options?.voucherSeries ?? []).map((s) => ({ value: s, label: s })),
          )}
          {field("creditAccountCompany", "Paid with the company's card or account", accountChoices)}
          {field("creditAccountEmployee", "Paid by an employee (to pay back)", accountChoices)}
          {field("vatStatus", "Does the company deduct VAT?", [
            { value: "full", label: "Yes, VAT-registered with full deduction" },
            { value: "none", label: "No: not VAT-registered or VAT-exempt" },
            { value: "partial", label: "Partly (mixed business)" },
          ])}
          <p className="type-caption text-[var(--ink-muted)]">
            Ask your accountant which ones to use, for example 1930 and 2890. Receipts with VAT aren&apos;t proposed until the VAT question
            is answered.
          </p>
          <Button type="button" variant="outline" className="w-full h-11" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
            Save Fortnox settings
          </Button>
        </div>
      )}

      {conn ? (
        confirming ? (
          <div className="space-y-2" role="group" aria-label="Disconnect Fortnox">
            <p className="type-body text-[var(--ink)]">
              Disconnect Fortnox? UnReceipt stops booking for this company; vouchers already booked stay in Fortnox. To end the
              permission on Fortnox&apos;s side too, remove UnReceipt under Integrationer in Fortnox.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setConfirming(false)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11 gap-1.5 text-[var(--destructive)]"
                onClick={disconnect}
                disabled={busy !== null}
              >
                {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Unplug className="w-4 h-4" aria-hidden="true" />}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" className="w-full h-11 gap-1.5" onClick={() => setConfirming(true)} disabled={busy !== null}>
            <Unplug className="w-4 h-4" aria-hidden="true" />
            Disconnect Fortnox
          </Button>
        )
      ) : null}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            message.ok
              ? "text-sm font-semibold text-[var(--ink)]"
              : "text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2"
          }
        >
          {message.text}
        </p>
      ) : null}
    </>
  );

  if (variant === "settings") {
    return (
      <section aria-labelledby={titleId} data-testid="fortnox-card">
        <h2 id={titleId} className="type-micro uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-2">
          Fortnox
        </h2>
        <div className="bg-card space-y-3" style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}>
          {body}
        </div>
      </section>
    );
  }
  return (
    <section
      className="bg-card space-y-3"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}
      data-testid="fortnox-card"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="font-display font-bold text-[var(--ink)] text-base">
        Fortnox
      </h2>
      {body}
    </section>
  );
}
