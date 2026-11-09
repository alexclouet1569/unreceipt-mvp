"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dayLabel } from "@/lib/bank/month";

export type ReminderState = {
  weekly: boolean;
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
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "10px 16px" }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold text-[var(--ink)]" style={{ fontSize: "14px" }}>
          Weekly reminder {weekly ? "on" : "off"}
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          {weekly
            ? `Every Monday ${clientName} gets an email listing missing receipts and receipts to complete, when there are any. Replies go to your firm's admin.`
            : `${clientName} gets no automatic email. You can still email the missing list by hand.`}
          {state.lastSentAt ? ` Last reminded ${dayLabel(state.lastSentAt.slice(0, 10))}.` : ""}
        </p>
        {problem ? (
          <p role="alert" className="text-[var(--attention-deep)]" style={{ fontSize: "13px" }}>
            {problem}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={weekly}
        aria-label={`Weekly reminder to ${clientName}`}
        disabled={saving}
        onClick={toggle}
        className="relative inline-flex shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        style={{
          width: "52px",
          height: "44px",
          padding: "0 4px",
        }}
      >
        <span
          aria-hidden="true"
          className="block rounded-full transition-colors"
          style={{ width: "44px", height: "26px", background: weekly ? "var(--brand-action)" : "var(--hairline)", position: "relative" }}
        >
          <span
            className="absolute top-[3px] block rounded-full bg-card transition-transform"
            style={{ width: "20px", height: "20px", left: "3px", transform: weekly ? "translateX(18px)" : "none" }}
          />
        </span>
      </button>
    </section>
  );
}
