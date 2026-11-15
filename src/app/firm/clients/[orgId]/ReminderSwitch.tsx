"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dayLabel } from "@/lib/bank/month";
import { Switch } from "@/components/Switch";

export type { ReminderState } from "@/lib/firm/portal-load";
import type { ReminderState } from "@/lib/firm/portal-load";

/**
 * The Monday reminder email for one client (src/lib/reminders/weekly.ts):
 * on or off, when the client was last reminded, and "Send a reminder now"
 * (the same email at once, src/lib/reminders/now.ts).
 */
export function ReminderSwitch({
  organizationId,
  clientName,
  state,
}: {
  organizationId: string;
  clientName: string;
  state: ReminderState;
}) {
  const router = useRouter();
  const [weekly, setWeekly] = useState(state.weekly);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const sendNow = async () => {
    if (sending) return;
    setSending(true);
    setProblem(null);
    setSentNote(null);
    const res = await fetch(`/api/firm/clients/${organizationId}/remind`, { method: "POST" }).catch(() => null);
    setSending(false);
    const body = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    if (!res) {
      setProblem("Couldn't send. Check your connection and try again.");
      return;
    }
    if (res.status === 429) {
      setProblem(`${clientName} was already reminded twice in the last 24 hours.`);
      return;
    }
    if (!res.ok) {
      setProblem(body?.message ?? "Couldn't send the reminder. Try again.");
      return;
    }
    setSentNote(`Reminder sent to ${clientName}.`);
    router.refresh();
  };
  const id = `weekly-reminder-${organizationId}`;

  const toggle = async () => {
    if (saving) return;
    const next = !weekly;
    setSaving(true);
    setProblem(null);
    setWeekly(next);
    const res = await fetch(`/api/firm/clients/${organizationId}/reminders`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekly: next }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setWeekly(!next);
      setProblem("Couldn't save. Try again.");
      return;
    }
    router.refresh();
  };

  return (
    <section
      aria-label="Weekly reminder"
      className="bg-card flex items-center justify-between gap-3"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "14px 16px" }}
    >
      <div className="min-w-0 flex-1">
        <p id={`${id}-title`} className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "14px" }}>
          Weekly reminder {weekly ? "on" : "off"}
        </p>
        <p id={`${id}-desc`} className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          {state.clientOptedOut
            ? `${clientName} turned weekly reminders off in their settings, so none is sent. You can still email the missing list by hand.`
            : weekly
              ? `On Mondays ${clientName} gets an email listing missing receipts and receipts to complete or confirm, when there are any. Replies go to your firm's admin.`
              : `${clientName} gets no automatic email. You can still email the missing list by hand.`}
          {state.lastSentAt ? ` Last reminded ${dayLabel(state.lastSentAt.slice(0, 10))}.` : ""}
        </p>
        {state.clientOptedOut ? null : (
          <button
            type="button"
            onClick={() => void sendNow()}
            disabled={sending}
            className="min-h-11 rounded-[10px] type-caption font-semibold text-[var(--ink)] underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send a reminder now"}
          </button>
        )}
        <div role="status">
          {problem ? (
            <p className="text-[var(--attention-deep)]" style={{ fontSize: "13px" }}>
              {problem}
            </p>
          ) : sentNote ? (
            <p className="type-caption text-[var(--ink-muted)]">{sentNote}</p>
          ) : null}
        </div>
      </div>
      <Switch checked={weekly} onClick={toggle} labelledBy={`${id}-title`} describedBy={`${id}-desc`} busy={saving} />
    </section>
  );
}
