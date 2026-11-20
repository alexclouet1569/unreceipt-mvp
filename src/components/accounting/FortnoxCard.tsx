"use client";

// "Fortnox" in Settings (an owner) and on a client's page in the firm portal
// (the firm's staff, `org` = the client): connect the company's Fortnox,
// choose the voucher series and the accounts payments come from, and
// disconnect. The booking agent then proposes a voucher for every confirmed
// receipt (src/lib/accounting/), which a person approves.
//
// Connect is a plain link (the CSP's form-action 'self' would block a form
// POST that redirects to Fortnox). Everything is checked again server-side.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FortnoxCardSummary = {
  configured: boolean;
  connection: { status: "active" | "needs_reconnect"; companyName: string | null; orgNumber: string | null } | null;
};

type Settings = { voucherSeries: string | null; creditAccountCompany: string | null; creditAccountEmployee: string | null };
type Options = { voucherSeries: string[]; paymentAccounts: Array<{ number: string; name: string }> } | null;

const inputClass =
  "w-full h-11 rounded-[10px] border border-[var(--hairline)] bg-card px-3 text-[15px] text-[var(--ink)]";

export function FortnoxCard({
  org,
  summary,
  result,
}: {
  /** The client's organisation id in the firm portal; null for the owner's own company. */
  org: string | null;
  summary: FortnoxCardSummary;
  result?: { ok: boolean; text: string } | null;
}) {
  const router = useRouter();
  const query = org ? `?org=${encodeURIComponent(org)}` : "";
  const conn = summary.connection;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [options, setOptions] = useState<Options>(null);
  const [busy, setBusy] = useState<"save" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(result ?? null);

  useEffect(() => {
    if (!conn || conn.status !== "active") return;
    let alive = true;
    fetch(`/api/accounting/settings${query}`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { settings: Settings; options: Options }) : null))
      .catch(() => null)
      .then((body) => {
        if (!alive || !body) return;
        setSettings(body.settings);
        setOptions(body.options);
      });
    return () => {
      alive = false;
    };
  }, [conn, query]);

  if (!summary.configured) return null;

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

  const disconnect = async () => {
    setBusy("disconnect");
    setMessage(null);
    try {
      const res = await fetch(`/api/accounting/fortnox${query}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { revoked?: boolean };
      if (!res.ok) {
        setMessage({ ok: false, text: "Couldn't disconnect. Try again." });
      } else {
        setMessage({
          ok: true,
          text: body.revoked
            ? "Fortnox is disconnected."
            : "Disconnected here. To be sure, also remove UnReceipt under Integrationer in Fortnox.",
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
      <span className="block text-[13px] font-semibold text-[var(--ink-muted)]">{label}</span>
      <select
        className={inputClass}
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

  return (
    <section
      className="rounded-[12px] border border-[var(--hairline)] bg-card px-4 py-4 space-y-3"
      data-testid="fortnox-card"
      aria-labelledby="fortnox-card-title"
    >
      <div className="space-y-1">
        <h2 id="fortnox-card-title" className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "17px" }}>
          Fortnox
        </h2>
        <p className="text-[14px] text-[var(--ink-muted)]">
          {conn
            ? conn.status === "active"
              ? `Connected to ${conn.companyName ?? "a Fortnox company"}${conn.orgNumber ? ` (${conn.orgNumber})` : ""}. Every confirmed receipt gets a proposed voucher; nothing is booked until a person approves it.`
              : "The connection has expired. Connect again to keep booking receipts."
            : "Connect the company's Fortnox: UnReceipt proposes a voucher for every confirmed receipt, with the receipt attached, and books it when a person approves. A system administrator in Fortnox approves the connection."}
        </p>
      </div>

      {!conn || conn.status !== "active" ? (
        <a
          href={`/api/accounting/fortnox/connect${query}`}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-[10px] bg-primary text-primary-foreground text-[14px] font-semibold transition-colors hover:bg-[var(--brand-action-deep)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid="fortnox-connect"
        >
          <Link2 className="w-4 h-4" aria-hidden="true" />
          {conn ? "Reconnect Fortnox" : "Connect Fortnox"}
        </a>
      ) : null}

      {conn?.status === "active" ? (
        settings && options ? (
          <div className="space-y-3">
            {field(
              "voucherSeries",
              "Voucher series",
              options.voucherSeries.map((s) => ({ value: s, label: s })),
            )}
            {field("creditAccountCompany", "Paid with the company's card or account", accountChoices)}
            {field("creditAccountEmployee", "Paid by an employee (to pay back)", accountChoices)}
            <p className="text-[12px] text-[var(--ink-muted)]">Ask your accountant which ones to use, for example 1930 and 2890.</p>
            <Button type="button" className="w-full h-11" onClick={save} disabled={busy !== null}>
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
              Save Fortnox settings
            </Button>
          </div>
        ) : (
          <p className="text-[14px] text-[var(--ink-muted)]">Reading the settings from Fortnox…</p>
        )
      ) : null}

      {conn ? (
        <Button type="button" variant="outline" className="w-full h-11 gap-1.5" onClick={disconnect} disabled={busy !== null}>
          {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Unplug className="w-4 h-4" aria-hidden="true" />}
          Disconnect Fortnox
        </Button>
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
    </section>
  );
}
