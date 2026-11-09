"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dayLabel } from "@/lib/bank/month";
import { Switch } from "@/components/Switch";

export type ReminderState = {
  weekly: boolean;
  // The client turned weekly reminders off in its own settings: nothing
  // is sent whatever this switch says.
  clientOptedOut: boolean;
  // The latest reminder email of either kind, if any.
  lastSentAt: string | null;
};

/**
 * The Monday reminder email for one client (src/lib/reminders/weekly.ts):
 * on or off, and when the client was last reminded.
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
        <div role="status">
          {problem ? (
            <p className="text-[var(--attention-deep)]" style={{ fontSize: "13px" }}>
              {problem}
            </p>
          ) : null}
        </div>
      </div>
      <Switch checked={weekly} onClick={toggle} labelledBy={`${id}-title`} describedBy={`${id}-desc`} busy={saving} />
    </section>
  );
}
