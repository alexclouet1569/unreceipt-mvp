"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { appUrl, SIGNUP_PATH } from "@/lib/app-url";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/locale";
import { PLANS, overagePriceLabel, planForReceipts, planPriceLabel } from "@/lib/plans";
import { LANDING_COPY, fill } from "./_landing-copy";

/**
 * Three flat monthly plans per company, sized by how many receipts the
 * company sends us. The receipts slider highlights the plan that fits.
 * Plans live in src/lib/plans.ts, shared with /subscribe and /api/checkout.
 */
const MIN_RECEIPTS = 1;
const MAX_RECEIPTS = PLANS[PLANS.length - 1].receipts;

export function Pricing({ pilotMode, locale = "en" }: { pilotMode: boolean; locale?: Locale }) {
  const [receipts, setReceipts] = useState(10);
  const all = LANDING_COPY[locale];
  const t = all.pricing;
  const cta = pilotMode ? all.hero.ctaPilot : all.hero.ctaPaid;
  const fits = planForReceipts(receipts);
  const [fitsBefore, fitsAfter = ""] = t.fits.split("{plan}");

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">{t.eyebrow}</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
          {t.title}
        </h2>
        <p className="text-[#303568]/60 text-base max-w-xl mx-auto">
          {t.lead}
        </p>
      </div>

      {/* Receipts per month → the plan that fits */}
      <div className="max-w-md mx-auto mb-10 bg-white border border-[#E8E5DD] rounded-2xl px-5 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <label htmlFor="receipts-per-month" className="text-sm font-semibold text-[#303568]">
            {t.slider}
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
          {fitsBefore}
          <span className="font-semibold text-[#303568]">{fits.name}</span>
          {fill(fitsAfter, { price: planPriceLabel(fits, locale) })}
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
                  {t.fitsBadge}
                </span>
              )}
              <h3 className="font-extrabold text-xl">{plan.name}</h3>
              <p className={`text-sm mt-1 mb-6 min-h-[40px] ${active ? "text-white/65" : "text-[#303568]/60"}`}>
                {t.who[plan.id]}
              </p>
              <div className="flex items-baseline gap-1">
                {/* Manrope, not mono: mono's wide period reads as "5 . 99". */}
                <span className="tabular-nums text-4xl font-extrabold tracking-tight">
                  {planPriceLabel(plan, locale)}
                </span>
                <span className={`text-sm ${active ? "text-white/60" : "text-[#303568]/50"}`}>
                  {t.perMonth}
                </span>
              </div>
              <p className={`text-sm font-semibold mt-3 ${active ? "text-[#27BE7B]" : "text-[#1F9D63]"}`}>
                {fill(t.upTo, { n: plan.receipts })}
              </p>
              <p className={`text-xs mt-1 ${active ? "text-white/60" : "text-[#303568]/50"}`}>
                {fill(t.overage, { price: overagePriceLabel(locale) })}
              </p>
              <div className={`border-t border-dashed my-5 ${active ? "border-white/20" : "border-[#E8E5DD]"}`} />
              <p className={`text-sm mb-6 ${active ? "text-white/65" : "text-[#303568]/60"}`}>
                {t.wholeCompany}
              </p>
              <a
                href={appUrl(SIGNUP_PATH)}
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
        {t.included.map((f) => (
          <div key={f} className="flex items-start gap-2.5 text-sm text-[#303568]/80">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#27BE7B]" />
            {f}
          </div>
        ))}
      </div>

      <p className="text-xs text-[#303568]/50 text-center mt-8">
        {pilotMode ? t.notePilot : t.notePaid}
      </p>
    </div>
  );
}
