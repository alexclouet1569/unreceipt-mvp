"use client";

import { ApprovalList } from "@/app/app/(authed)/team/ApprovalList";
import { PayBackList } from "@/app/app/(authed)/team/PayBackList";
import { SectionLabel } from "@/app/app/(authed)/team/_section-label";
import type { ApprovalQueueItem, MobileReceipt, ReimbursementGroup } from "@/lib/mobile/types";
import type { PaidBy, ReceiptCategory } from "@/lib/types";

// The owner's Team screen (/app/team) in the company tour, with sample
// receipts from the team. The real ApprovalList and PayBackList: their
// POSTs (/api/receipts/<id>/decision, /api/team/reimbursements) are answered
// in the browser by the tour (_company-tour.tsx), which also moves an
// approved own-money outlay into "To pay back". "People" (inviting and
// roles) is left out: it would call real routes.

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function queued(o: {
  id: string;
  employee: string;
  merchant: string;
  category: ReceiptCategory;
  total: number;
  day: number;
  paidBy: PaidBy;
  notes?: string;
}): ApprovalQueueItem {
  const receipt: MobileReceipt = {
    id: o.id,
    status: "verified",
    missing: [],
    source: "paper",
    merchant: o.merchant,
    category: o.category,
    currency: "SEK",
    total: o.total,
    homeCurrency: "SEK",
    homeTotal: o.total,
    fxSource: "same",
    date: daysAgo(o.day),
    createdAt: new Date().toISOString(),
    // No original in the demo: the row shows no "Original" button.
    original: null,
    notes: o.notes ?? null,
    possibleDuplicate: false,
    exportedAt: null,
    bookedAt: null,
    approval: { status: "submitted", comment: null, paidBy: o.paidBy, reimbursed: false },
  };
  return { receipt, employee: o.employee, submittedAt: new Date().toISOString() };
}

export const DEMO_APPROVAL_QUEUE: ApprovalQueueItem[] = [
  queued({
    id: "demo-team-1",
    employee: "Erik Lund",
    merchant: "Circle K",
    category: "transport",
    total: 812,
    day: 1,
    paidBy: "employee",
    notes: "Fuel, client visit in Uppsala",
  }),
  queued({
    id: "demo-team-2",
    employee: "Sara Nilsson",
    merchant: "Taxi Stockholm",
    category: "transport",
    total: 389,
    day: 2,
    paidBy: "company",
  }),
  queued({
    id: "demo-team-3",
    employee: "Johan Ek",
    merchant: "Restaurang Pelikan",
    category: "client_entertainment",
    total: 1240,
    day: 3,
    paidBy: "employee",
    notes: "Client dinner",
  }),
];

export const DEMO_PAY_BACK: ReimbursementGroup[] = [
  {
    userId: "demo-sara",
    employee: "Sara Nilsson",
    currency: "SEK",
    total: 156,
    count: 1,
    receiptIds: ["demo-team-0"],
  },
];

/** An approved own-money outlay joins its employee's line in "To pay back". */
export function addToPayBack(groups: ReimbursementGroup[], item: ApprovalQueueItem): ReimbursementGroup[] {
  const r = item.receipt;
  if (r.approval?.paidBy !== "employee" || r.total == null) return groups;
  const userId = `demo-${item.employee}`;
  const existing = groups.find((g) => g.employee === item.employee && g.currency === r.currency);
  if (existing) {
    return groups.map((g) =>
      g === existing
        ? { ...g, total: g.total + r.total!, count: g.count + 1, receiptIds: [...g.receiptIds, r.id] }
        : g
    );
  }
  return [...groups, { userId, employee: item.employee, currency: r.currency, total: r.total, count: 1, receiptIds: [r.id] }];
}

export function DemoTeam({ queue, payBack }: { queue: ApprovalQueueItem[]; payBack: ReimbursementGroup[] }) {
  return (
    <main className="mx-auto max-w-[640px] space-y-8 px-4 py-6 pb-16">
      <div className="space-y-1">
        <h1 className="type-display-lg text-[var(--ink)]">Team</h1>
        <p className="type-body text-[var(--ink-muted)]">
          Nordljus Design AB
        </p>
      </div>

      <section aria-labelledby="approve-heading" className="space-y-3">
        <SectionLabel id="approve-heading">To approve</SectionLabel>
        <ApprovalList items={queue} />
      </section>

      <section aria-labelledby="payback-heading" className="space-y-3">
        <SectionLabel id="payback-heading">To pay back</SectionLabel>
        <PayBackList groups={payBack} />
      </section>
    </main>
  );
}
