"use client";

// The owner's team (2026-11-15): who is in it, their role (Employee or
// Approver) and who approves them; invite by email; remove someone or
// withdraw an invite. /api/team, /api/team/members/<id>, /api/team/invites/<id>.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeamView } from "@/lib/team/invites";

const ROLE_LABEL = { owner: "Owner", approver: "Approver", member: "Employee" } as const;

const FIELD =
  "h-11 rounded-[10px] border border-[var(--hairline)] bg-card px-3 text-[15px] text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function message(error: string | undefined): string {
  switch (error) {
    case "invalid_email":
      return "That doesn't look like an email address.";
    case "own_address":
      return "That's your own address.";
    case "already_member":
      return "This person is already in your team.";
    case "team_full":
      return "Your team has 50 people, the most for now.";
    case "rate_limited":
      return "Many invites in a short time. Try again later.";
    default:
      return "Couldn't save. Try again.";
  }
}

export function TeamManager({ view }: { view: TeamView }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "approver">("member");
  const [approverId, setApproverId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const deciders = view.members.filter((m) => m.role === "owner" || m.role === "approver");

  const call = async (key: string, url: string, init: RequestInit, done?: string) => {
    if (busy) return false;
    setBusy(key);
    setNote(null);
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        if (done) setNote({ ok: true, text: done });
        router.refresh();
        setBusy(null);
        return true;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setNote({ ok: false, text: message(body.error) });
    } catch {
      setNote({ ok: false, text: "Couldn't save. Check your connection and try again." });
    }
    setBusy(null);
    return false;
  };

  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await call(
      "invite",
      "/api/team",
      json("POST", { email, role, approverId: approverId || null }),
      `Invite sent to ${email.trim()}. They join by pressing Join in the email.`
    );
    if (ok) setEmail("");
  };

  return (
    <div className="space-y-4">
      <ul
        role="list"
        className="bg-card divide-y divide-[var(--hairline)]"
        style={{ border: "1px solid var(--hairline)", borderRadius: "12px" }}
      >
        {view.members.map((m) => (
          <li key={m.userId} className="space-y-2" style={{ padding: "12px 14px" }}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[var(--ink)] [overflow-wrap:anywhere]" style={{ fontSize: "15px", fontWeight: 600 }}>
                  {m.label}
                  {m.you ? " (you)" : ""}
                </span>
                {m.email && m.email !== m.label ? (
                  <span className="block text-[var(--ink-muted)] [overflow-wrap:anywhere]" style={{ fontSize: "13px" }}>
                    {m.email}
                  </span>
                ) : null}
              </span>
              {m.role === "owner" ? (
                <span className="text-[var(--ink-muted)]" style={{ fontSize: "13px", fontWeight: 600 }}>
                  {ROLE_LABEL.owner}
                </span>
              ) : null}
            </div>
            {m.role === "owner" ? null : (
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`role-${m.userId}`}>
                  Role of {m.label}
                </label>
                <select
                  id={`role-${m.userId}`}
                  className={FIELD}
                  value={m.role}
                  disabled={busy !== null}
                  onChange={(e) => call(`role-${m.userId}`, `/api/team/members/${m.userId}`, json("PATCH", { role: e.target.value }))}
                >
                  <option value="member">{ROLE_LABEL.member}</option>
                  <option value="approver">{ROLE_LABEL.approver}</option>
                </select>
                <label className="sr-only" htmlFor={`approver-${m.userId}`}>
                  Who approves {m.label}
                </label>
                <select
                  id={`approver-${m.userId}`}
                  className={FIELD}
                  value={m.approverId ?? ""}
                  disabled={busy !== null}
                  onChange={(e) =>
                    call(`approver-${m.userId}`, `/api/team/members/${m.userId}`, json("PATCH", { approverId: e.target.value || null }))
                  }
                >
                  <option value="">Approved by: the owners</option>
                  {deciders
                    .filter((d) => d.userId !== m.userId)
                    .map((d) => (
                      <option key={d.userId} value={d.userId}>
                        Approved by: {d.label}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 text-destructive hover:text-destructive"
                  disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.label} from the team? Their receipts stay with the company.`)) {
                      void call(`remove-${m.userId}`, `/api/team/members/${m.userId}`, json("DELETE"));
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </li>
        ))}
        {view.invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3" style={{ padding: "12px 14px" }}>
            <span className="min-w-0">
              <span className="block text-[var(--ink)] [overflow-wrap:anywhere]" style={{ fontSize: "15px", fontWeight: 600 }}>
                {i.email}
              </span>
              <span className="block text-[var(--ink-muted)]" style={{ fontSize: "13px" }}>
                Invited as {ROLE_LABEL[i.role].toLowerCase()} · hasn&apos;t joined yet
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy !== null}
              onClick={() => call(`revoke-${i.id}`, `/api/team/invites/${i.id}`, json("DELETE"))}
            >
              Withdraw
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={invite} className="space-y-2" aria-labelledby="invite-heading">
        <p id="invite-heading" className="text-[15px] font-semibold text-[var(--ink)]">
          Invite someone
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          They get an email and join by pressing Join, signed in with that address. Employees send their receipts
          for approval; approvers also approve the people you assign to them. Your accountant sees a receipt only once
          it is approved.
        </p>
        <label className="sr-only" htmlFor="invite-email">
          Email address
        </label>
        <input
          id="invite-email"
          type="email"
          required
          autoComplete="off"
          placeholder="name@company.se"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${FIELD} w-full`}
        />
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="invite-role">
            Role
          </label>
          <select id="invite-role" className={FIELD} value={role} onChange={(e) => setRole(e.target.value as "member" | "approver")}>
            <option value="member">{ROLE_LABEL.member}</option>
            <option value="approver">{ROLE_LABEL.approver}</option>
          </select>
          <label className="sr-only" htmlFor="invite-approver">
            Who approves them
          </label>
          <select id="invite-approver" className={FIELD} value={approverId} onChange={(e) => setApproverId(e.target.value)}>
            <option value="">Approved by: the owners</option>
            {deciders.map((d) => (
              <option key={d.userId} value={d.userId}>
                Approved by: {d.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-11 gap-1.5" disabled={busy !== null || email.trim().length < 3}>
            {busy === "invite" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />}
            Send invite
          </Button>
        </div>
      </form>

      {note ? (
        <p
          role={note.ok ? "status" : "alert"}
          className={
            note.ok
              ? "text-sm text-[var(--ink)] rounded-md px-3 py-2 bg-[var(--surface)]"
              : "text-sm font-semibold text-[var(--attention-deep)] bg-[var(--attention-tint)] rounded-md px-3 py-2"
          }
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
