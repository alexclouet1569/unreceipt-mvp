"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";

/**
 * Usage-based, per-employee pricing. A company picks the plan that
 * matches how many receipts a typical employee files per month;
 * the allowance is pooled across the whole team.
 */
export const PLANS = [
  {
    name: "Light",
    price: 5,
    receipts: 5,
    who: "Occasional spenders — office and back-office staff.",
  },
  {
    name: "Regular",
    price: 9,
    receipts: 15,
    who: "Sales, managers, anyone who meets clients.",
    popular: true,
  },
  {
    name: "Heavy",
    price: 14,
    receipts: 40,
    who: "Field staff, consultants and frequent travellers.",
  },
] as const;

const INCLUDED = [
  "Private address — forward any receipt",
  "Photo capture with auto-fill",
  "VAT-ready records within 24 hours",
  "Original file + PDF for every receipt",
  "Every receipt checked by our concierge",
  "Cancel anytime",
];

const MIN_TEAM = 1;
const MAX_TEAM = 100;

export function Pricing({ pilotMode }: { pilotMode: boolean }) {
  const [team, setTeam] = useState(10);
  const cta = pilotMode ? "Join the pilot" : "Start your free week";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold text-[#27BE7B] uppercase tracking-widest mb-3">Pricing</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#303568] mb-4">
          Pay for how your team spends
        </h2>
        <p className="text-[#303568]/60 text-base max-w-xl mx-auto">
          Pick the plan that matches how many receipts a typical employee
          files each month. The allowance is pooled across your whole team.
        </p>
      </div>

      {/* Team size */}
      <div className="max-w-md mx-auto mb-10 bg-white border border-[#E8E5DD] rounded-2xl px-5 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <label htmlFor="team-size" className="text-sm font-semibold text-[#303568]">
            Employees with expenses
          </label>
          <span className="font-mono tabular-nums text-lg font-medium text-[#303568]" aria-live="polite">
            {team}
          </span>
        </div>
        <input
          id="team-size"
          type="range"
          min={MIN_TEAM}
          max={MAX_TEAM}
          value={team}
          onChange={(e) => setTeam(Number(e.target.value))}
          className="team-slider w-full h-6 cursor-pointer"
          style={
            { "--fill": `${((team - MIN_TEAM) / (MAX_TEAM - MIN_TEAM)) * 100}%` } as React.CSSProperties
          }
        />
        <style jsx>{`
          .team-slider {
            -webkit-appearance: none;
            appearance: none;
            background: transparent;
          }
          .team-slider::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right, #27be7b var(--fill), #e8e5dd var(--fill));
          }
          .team-slider::-moz-range-track {
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right, #27be7b var(--fill), #e8e5dd var(--fill));
          }
          .team-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 22px;
            height: 22px;
            margin-top: -8px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #27be7b;
          }
          .team-slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #27be7b;
          }
          .team-slider:focus-visible {
            outline: 2px solid #27be7b;
            outline-offset: 4px;
            border-radius: 4px;
          }
        `}</style>
      </div>

      <div className="grid md:grid-cols-3 gap-5 items-stretch">
        {PLANS.map((plan) => {
          const popular = "popular" in plan && plan.popular;
          return (
            <div
              key={plan.name}
              data-plan={plan.name}
              className={`relative rounded-3xl p-7 flex flex-col ${
                popular
                  ? "bg-[#303568] text-white"
                  : "bg-white text-[#303568] border border-[#E8E5DD]"
              }`}
            >
              {popular && (
                <span className="absolute -top-3 left-7 bg-[#27BE7B] text-white text-[10px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1">
                  Most chosen
                </span>
              )}
              <h3 className="font-extrabold text-xl">{plan.name}</h3>
              <p className={`text-sm mt-1 mb-6 min-h-[40px] ${popular ? "text-white/65" : "text-[#303568]/60"}`}>
                {plan.who}
              </p>
              <div className="flex items-baseline gap-1">
                <span className="font-mono tabular-nums text-4xl font-medium tracking-tight">
                  €{plan.price}
                </span>
                <span className={`text-sm ${popular ? "text-white/60" : "text-[#303568]/50"}`}>
                  / employee / month
                </span>
              </div>
              <p className={`text-sm font-semibold mt-3 ${popular ? "text-[#27BE7B]" : "text-[#1F9D63]"}`}>
                Up to {plan.receipts} receipts per employee
              </p>
              <div className={`border-t border-dashed my-5 ${popular ? "border-white/20" : "border-[#E8E5DD]"}`} />
              <div className="flex items-baseline justify-between mb-6">
                <span className={`text-sm ${popular ? "text-white/65" : "text-[#303568]/60"}`}>
                  {team} {team === 1 ? "employee" : "employees"}
                </span>
                <span className="font-mono tabular-nums text-lg font-medium">
                  €{plan.price * team}
                  <span className={`text-xs font-sans ml-1 ${popular ? "text-white/50" : "text-[#303568]/45"}`}>/mo</span>
                </span>
              </div>
              <a href={appUrl("/app/login")} className="mt-auto">
                <Button
                  className={`w-full rounded-full font-semibold h-12 ${
                    popular
                      ? "bg-[#27BE7B] text-white hover:bg-[#1F9D63]"
                      : "bg-[#ECF7E7] text-[#303568] hover:bg-[#dff0d8]"
                  }`}
                >
                  {cta}
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
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
          ? "Free during the pilot. The prices above apply once the pilot ends. All prices excl. VAT."
          : "First week free on every plan. All prices excl. VAT."}
      </p>
    </div>
  );
}
