"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MemberView = { id: string; email: string; role: "admin" | "staff"; claimed: boolean };

export function MembersSection({
  members,
  isAdmin,
  selfId,
}: {
  members: MemberView[];
  isAdmin: boolean;
  selfId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("add");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/firm/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't add. Try again.");
        return;
      }
      setNotice(`${email} can now sign in at app.unreceipt.com with that address and will land in the firm portal.`);
      setEmail("");
      router.refresh();
    } catch {
      setError("Couldn't add. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: MemberView) => {
    setBusy(m.id);
    setError(null);
    try {
      const res = await fetch(`/api/firm/members/${encodeURIComponent(m.id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't remove. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't remove. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <ul
        role="list"
        className="bg-card divide-y divide-[var(--hairline)]"
        style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
      >
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3" style={{ padding: "6px 6px 6px 14px", minHeight: "52px" }}>
            <span className="min-w-0">
              <span className="block truncate text-[var(--ink)]" style={{ fontSize: "15px" }}>
                {m.email}
                {m.id === selfId ? <span className="text-[var(--ink-muted)]"> (you)</span> : null}
              </span>
              <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                {m.role === "admin" ? "Admin" : "Staff"}
                {m.claimed ? "" : " · hasn't signed in yet"}
              </span>
            </span>
            {isAdmin && m.id !== selfId ? (
              <button
                type="button"
                onClick={() => remove(m)}
                disabled={busy !== null}
                aria-label={`Remove ${m.email}`}
                className="shrink-0 inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors disabled:opacity-50"
                style={{ width: "44px", height: "44px", borderRadius: "10px" }}
              >
                {busy === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {isAdmin ? (
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <label htmlFor="member-email" className="sr-only">
            Colleague&apos;s email
          </label>
          <Input
            id="member-email"
            type="email"
            inputMode="email"
            placeholder="colleague@firm.se"
            className="h-11 flex-1 min-w-[12rem]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="member-role" className="sr-only">
            Role
          </label>
          <select
            id="member-role"
            className="h-11 rounded-md border bg-card px-3 text-base md:text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "staff")}
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" variant="outline" className="h-11" disabled={busy !== null || !email.trim()}>
            {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Add
          </Button>
        </form>
      ) : (
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
          Ask a firm admin to add or remove people.
        </p>
      )}

      {notice ? (
        <p role="status" className="text-[var(--ink-muted)]" style={{ fontSize: "14px" }}>
          {notice}
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
