"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Add client": the firm types the company, its org.nr and the email of the
 * person who will connect. POST /api/firm/clients creates the invite and
 * emails the link. Inline form rather than a modal: one obvious action.
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
        <Button type="button" className="h-11" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
          Add client
        </Button>
        {notice ? (
          <p role="status" className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
            {notice}
          </p>
        ) : null}
      </div>
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
          <Input id={`${id}-org`} className="h-11" value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} maxLength={20} placeholder="556677-8899" />
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
