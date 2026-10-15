"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";
import { cn } from "@/lib/utils";
import { OVERAGE_PRICE, PLANS, formatPrice, planForReceipts } from "@/lib/plans";

/**
 * Three flat monthly plans per company, sized by how many receipts the
 * company sends us. The receipts slider highlights the plan that fits.
 * Plans live in src/lib/plans.ts, shared with /subscribe and /api/checkout.
 */
const INCLUDED = [
  "Private address — forward any receipt",
  "Photo capture with auto-fill",
  "VAT-ready records within 24 hours",
  "Original file + PDF for every receipt",
  "Every receipt checked by our concierge",
  "Cancel anytime",
];

const MIN_RECEIPTS = 1;
const MAX_RECEIPTS = PLANS[PLANS.length - 1].receipts;

export function Pricing({ pilotMode }: { pilotMode: boolean }) {
  const [receipts, setReceipts] = useState(10);
  const cta = pilotMode ? "Join the pilot" : "Start your free week";
  const fits = planForReceipts(receipts);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">Pricing</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
          Pay for the receipts you send
        </h2>
        <p className="text-[#303568]/60 text-base max-w-xl mx-auto">
          One monthly price for your whole company — no per-user fees. Pick
          the plan that covers how many receipts you send us each month.
        </p>
      </div>

      {/* Receipts per month → the plan that fits */}
      <div className="max-w-md mx-auto mb-10 bg-white border border-[#E8E5DD] rounded-2xl px-5 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <label htmlFor="receipts-per-month" className="text-sm font-semibold text-[#303568]">
            Receipts per month
          </label>
          <span className="font-mono tabular-nums text-lg font-medium text-[#303568]" aria-live="polite">
            {receipts}
          </span>
        </div>
        <input
          id="receipts-per-month"
          type="range"
          min={MIN_RECEIPTS}
          max={MAX_RECEIPTS}
          value={receipts}
          onChange={(e) => setReceipts(Number(e.target.value))}
          className="receipts-slider w-full h-6 cursor-pointer"
          style={
            {
              "--fill": `${((receipts - MIN_RECEIPTS) / (MAX_RECEIPTS - MIN_RECEIPTS)) * 100}%`,
            } as React.CSSProperties
          }
        />
        <p className="text-sm text-[#303568]/70 mt-2" data-testid="plan-fit">
          <span className="font-semibold text-[#303568]">{fits.name}</span> fits you —{" "}
          {formatPrice(fits.price)} / month excl. VAT.
        </p>
        <style jsx>{`
          .receipts-slider {
            -webkit-appearance: none;
            appearance: none;
            background: transparent;
          }
          .receipts-slider::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right, #27be7b var(--fill), #e8e5dd var(--fill));
          }
          .receipts-slider::-moz-range-track {
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right, #27be7b var(--fill), #e8e5dd var(--fill));
          }
          .receipts-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 22px;
            height: 22px;
            margin-top: -8px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #27be7b;
          }
          .receipts-slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #27be7b;
          }
          .receipts-slider:focus-visible {
            outline: 2px solid #27be7b;
            outline-offset: 4px;
            border-radius: 4px;
          }
        `}</style>
      </div>

      <div className="grid md:grid-cols-3 gap-5 items-stretch">
        {PLANS.map((plan) => {
          const active = plan.id === fits.id;
          return (
            <div
              key={plan.id}
              data-plan={plan.name}
              data-fits={active ? "" : undefined}
              className={`relative rounded-3xl p-7 flex flex-col transition-colors duration-300 ${
                active
                  ? "bg-[#303568] text-white"
                  : "bg-white text-[#303568] border border-[#E8E5DD]"
              }`}
            >
              {active && (
                <span className="absolute -top-3 left-7 bg-[#27BE7B] text-white text-[10px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1">
                  Fits you
                </span>
              )}
              <h3 className="font-extrabold text-xl">{plan.name}</h3>
              <p className={`text-sm mt-1 mb-6 min-h-[40px] ${active ? "text-white/65" : "text-[#303568]/60"}`}>
                {plan.who}
              </p>
              <div className="flex items-baseline gap-1">
                {/* Manrope, not mono: mono's wide period reads as "5 . 99". */}
                <span className="tabular-nums text-4xl font-extrabold tracking-tight">
                  {formatPrice(plan.price)}
                </span>
                <span className={`text-sm ${active ? "text-white/60" : "text-[#303568]/50"}`}>
                  / month excl. VAT
                </span>
              </div>
              <p className={`text-sm font-semibold mt-3 ${active ? "text-[#27BE7B]" : "text-[#1F9D63]"}`}>
                Up to {plan.receipts} receipts / month
              </p>
              <p className={`text-xs mt-1 ${active ? "text-white/60" : "text-[#303568]/50"}`}>
                Then {formatPrice(OVERAGE_PRICE)} per extra receipt
              </p>
              <div className={`border-t border-dashed my-5 ${active ? "border-white/20" : "border-[#E8E5DD]"}`} />
              <p className={`text-sm mb-6 ${active ? "text-white/65" : "text-[#303568]/60"}`}>
                Whole company included, no per-user fees.
              </p>
              <a
                href={appUrl("/app/login")}
                className={cn(buttonVariants({
                  className: `mt-auto w-full rounded-full font-semibold h-12 ${
                    active
                      ? "bg-[#27BE7B] text-white hover:bg-[#1F9D63]"
                      : "bg-[#ECF7E7] text-[#303568] hover:bg-[#dff0d8]"
                  }`,
                }))}
              >
                {cta}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </a>
            </div>
          );
        })}
      </div>

      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 max-w-3xl mx-auto">
        {INCLUDED.map((f) => (
          <div key={f} className="flex items-start gap-2.5 text-sm text-[#303568]/80">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#27BE7B]" />
            {f}
          </div>
        ))}
      </div>

      <p className="text-xs text-[#303568]/50 text-center mt-8">
        {pilotMode
          ? "Free during the pilot. The prices above apply once the pilot ends. All prices excl. VAT; Swedish companies pay 25% moms on top, EU companies with a VAT number are reverse-charged."
          : "First week free on every plan. All prices excl. VAT; Swedish companies pay 25% moms on top, EU companies with a VAT number are reverse-charged."}
      </p>
    </div>
  );
}
