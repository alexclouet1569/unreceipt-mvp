"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_BULK, parseInviteLines } from "@/lib/firm/bulk-lines";

/**
 * "Add client": the firm types the company, its org.nr and the email of the
 * person who will connect. POST /api/firm/clients creates the invite and
 * emails the link. Inline form rather than a modal: one obvious action.
 * "Invite several" takes a pasted list instead (one client per line,
 * src/lib/firm/bulk-lines.ts) and sends up to 25 invites at once
 * (POST /api/firm/clients/bulk).
 */
export function AddClientDialog() {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [several, setSeveral] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/firm/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: name, client_org_number: orgNumber, email }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; emailed?: boolean };
      if (!res.ok) {
        setError(body.error ?? "Couldn't send the invite. Try again.");
        return;
      }
      setNotice(
        body.emailed === false
          ? `Saved, but the email to ${email} couldn't be sent. They can still connect from their Settings.`
          : `Invite sent to ${email}.`
      );
      setName("");
      setOrgNumber("");
      setEmail("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't send the invite. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11"
            onClick={() => {
              setSeveral(false);
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Add client
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => {
              setSeveral(true);
              setOpen(true);
            }}
          >
            <Users className="w-4 h-4" />
            Invite several
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            {notice}
          </p>
        ) : null}
      </div>
    );
  }

  if (several) {
    return (
      <InviteSeveral
        onClose={(message) => {
          setOpen(false);
          setSeveral(false);
          if (message) {
            setNotice(message);
            router.refresh();
          }
        }}
      />
    );
  }

  const field = "space-y-1";
  const label = "block text-[var(--ink-muted)]";
  return (
    <form
      onSubmit={submit}
      className="bg-card space-y-3"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}
      aria-labelledby={`${id}-title`}
    >
      <p id={`${id}-title`} className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
        Add a client company
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={field}>
          <label htmlFor={`${id}-name`} className={label} style={{ fontSize: "13px" }}>
            Company name
          </label>
          <Input id={`${id}-name`} className="h-11" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-org`} className={label} style={{ fontSize: "13px" }}>
            Org.nr (optional)
          </label>
          <Input id={`${id}-org`} className="h-11" value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} maxLength={20} placeholder="10 digits" />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-email`} className={label} style={{ fontSize: "13px" }}>
            Their email
          </label>
          <Input id={`${id}-email`} className="h-11" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} />
        </div>
      </div>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
        They get an email with a link to connect your firm. If they don&apos;t
        have UnReceipt yet, the same link lets them sign up first.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={busy || !name.trim() || !email.trim()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Send invite
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          className="text-sm rounded-[10px] px-3 py-2 text-[var(--attention-deep)]"
          style={{ background: "var(--attention-tint)" }}
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}

type BulkLine = { email: string; status: "sent" | "saved" | "skipped" | "invalid" | "failed" };

const LINE_LABEL: Record<BulkLine["status"], string> = {
  sent: "invite sent",
  saved: "saved, email not sent",
  skipped: "already invited or connected",
  invalid: "not an email address",
  failed: "not saved, try again",
};

/** A pasted list of clients, up to MAX_BULK at once. */
function InviteSeveral({ onClose }: { onClose: (message: string | null) => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkLine[] | null>(null);
  const { invites, unreadable } = parseInviteLines(text);
  const tooMany = invites.length > MAX_BULK;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/firm/clients/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invites }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; lines?: BulkLine[] };
      if (!res.ok || !body.lines) {
        setError(
          res.status === 429
            ? "You've sent many invites today. Try again tomorrow, or invite one by one."
            : (body.error ?? "Couldn't send the invites. Try again."),
        );
        return;
      }
      setResult(body.lines);
    } catch {
      setError("Couldn't send the invites. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const sent = result.filter((l) => l.status === "sent" || l.status === "saved").length;
    return (
      <div className="bg-card space-y-3 rounded-[12px] border border-[var(--hairline)] p-4" role="status">
        <p className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
          {sent === 1 ? "1 invite sent" : `${sent} invites sent`}
        </p>
        <ul className="divide-y divide-[var(--hairline)] rounded-[10px] border border-[var(--hairline)]">
          {result.map((l) => (
            <li key={`${l.email}-${l.status}`} className="flex flex-wrap justify-between gap-x-3 px-3 py-2 type-caption">
              <span className="break-all text-[var(--ink)]">{l.email}</span>
              <span className={l.status === "failed" || l.status === "invalid" ? "text-[var(--attention-deep)]" : "text-[var(--ink-muted)]"}>
                {LINE_LABEL[l.status]}
              </span>
            </li>
          ))}
        </ul>
        <Button type="button" className="h-11" onClick={() => onClose(sent > 0 ? `${sent} invite${sent === 1 ? "" : "s"} sent.` : null)}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-card space-y-3 rounded-[12px] border border-[var(--hairline)] p-4" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`} className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "16px" }}>
        Invite several clients
      </p>
      <label htmlFor={`${id}-list`} className="block type-caption text-[var(--ink-muted)]">
        One client per line: an email address, or the company name and the address (as copied from a spreadsheet).
        Up to {MAX_BULK} at once.
      </label>
      <textarea
        id={`${id}-list`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="w-full rounded-[10px] border border-[var(--hairline)] bg-background px-3 py-2 text-[16px] text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        placeholder={"Hallonbergen Bygg AB, anna@hallonbygg.se\nmaja@nordljusdesign.se"}
      />
      <p className="type-caption text-[var(--ink-muted)]" aria-live="polite">
        {invites.length === 0
          ? "No addresses yet."
          : tooMany
            ? `${invites.length} addresses: send at most ${MAX_BULK} at once.`
            : `${invites.length} client${invites.length === 1 ? "" : "s"} to invite.`}
        {unreadable.length > 0 ? ` ${unreadable.length} line${unreadable.length === 1 ? " has" : "s have"} no address and will be left out.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={busy || invites.length === 0 || tooMany}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Send invites
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => onClose(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="rounded-[10px] px-3 py-2 text-sm text-[var(--attention-deep)]" style={{ background: "var(--attention-tint)" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
