"use client";

import { DemoNotice, TourBar, TourEnd, useDemoLinkGuard, type TourStep } from "../_tour";
import { FirmApp, ORG_HB, type DemoParams } from "./_firm-app";
import type { JoinLinkView } from "@/app/firm/clients/JoinLinkPanel";

const STEPS: TourStep[] = [
  {
    title: "Your clients",
    text: (
      <>
        Every client company, and how many receipts need a check. Click <b>Add client</b> to invite one by email,
        or share <b>your firm&apos;s link</b>: clients open it and say yes.
      </>
    ),
  },
  {
    title: "Find missing receipts",
    text: (
      <>
        The client&apos;s bank statement is imported: payments without a receipt are in red. Pick <b>Resolve…</b> on
        the bank fee, or <b>Email</b> the client the list.
      </>
    ),
  },
  {
    title: "Check a receipt",
    text: (
      <>
        Click <b>Review needed</b> and open the parking receipt: what&apos;s missing is in red. Fill it in (60 kr) and
        the EasyPark payment finds its receipt by itself.
      </>
    ),
  },
  {
    title: "Export for your bookkeeping",
    text: (
      <>
        Click <b>Create export</b>: one file for Spiris plus every PDF. Then open a receipt and <b>Mark as booked</b>.
      </>
    ),
  },
  { title: "That's it", text: "Your clients' receipts arrive checked and ready, every month." },
];

/** The tour's steps, for the test that keeps steps.ts in step with them. */
export const ACCOUNTANT_STEPS = STEPS;

const hrefFor = (step: number, p: Partial<DemoParams> = {}) => {
  const q = new URLSearchParams({ step: String(step) });
  if (p.view) q.set("view", p.view);
  if (p.org) q.set("org", p.org);
  if (p.month) q.set("month", p.month);
  return `/demo/accountant?${q.toString()}`;
};

export function AccountantTour({
  step,
  view,
  org,
  month,
  joinLink,
}: {
  step: number;
  view: DemoParams["view"] | null;
  org: string | null;
  month: string | null;
  joinLink: JoinLinkView;
}) {
  const [notice, closeNotice] = useDemoLinkGuard();
  // Each step opens on its own screen; links inside the portal keep the step.
  const params: DemoParams =
    view !== null
      ? { view, org, month }
      : step === 1
        ? { view: "clients", org: null, month }
        : { view: "client", org: ORG_HB, month };

  return (
    <div className="min-h-screen bg-background">
      <TourBar steps={STEPS} step={step} hrefFor={(n) => hrefFor(n)} />
      <DemoNotice notice={notice} onClose={closeNotice} />
      {step < STEPS.length ? (
        <FirmApp params={params} hrefFor={(p) => hrefFor(step, p)} screenKey={String(step)} joinLink={joinLink} />
      ) : (
        <TourEnd
          tour="accountant"
          title="That's the accountant side"
          text="Clients share their receipts with one tap. You check, export and book them in one place."
          cta="Talk to us"
          ctaHref="mailto:support@unreceipt.com?subject=UnReceipt%20for%20our%20firm"
          other={{ label: "See the company side", href: "/demo/company?step=1" }}
        />
      )}
    </div>
  );
}
