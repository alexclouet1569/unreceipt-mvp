"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Sets up an accounting firm for an accountant (/api/admin/firms): she
// gets an email and claims the firm on her first sign-in.
export function CreateFirmForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/firms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string; emailed?: boolean } | undefined;
    setBusy(false);
    if (!res || !res.ok) {
      setMessage({ ok: false, text: body?.error ?? "Couldn't save. Try again." });
      return;
    }
    setMessage({
      ok: true,
      text: body?.emailed
        ? `${name} is set up. ${email} got an email with the sign-in link.`
        : `${name} is set up, but the email didn't go out: send ${email} the link to /firm yourself.`,
    });
    setName("");
    setEmail("");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="grid gap-1 text-xs font-medium">
        Firm name
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the accounting firm" required minLength={2} maxLength={200} className="h-10" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Accountant&apos;s email
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Her work address" required className="h-10" />
      </label>
      <Button type="submit" disabled={busy} className="h-10">
        {busy ? "Setting up…" : "Set up the firm"}
      </Button>
      {message ? (
        <p role="status" className={`sm:col-span-3 text-sm ${message.ok ? "text-emerald-700" : "text-amber-700"}`}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
