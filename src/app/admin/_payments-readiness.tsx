import { CheckCircle2, CircleAlert, Circle } from "lucide-react";
import type { PaymentsReadiness } from "@/lib/payments-readiness";

/**
 * Go-live reminder on /admin: stays until every automatic payment check
 * passes. Admin is outside the design system, so plain Tailwind is fine.
 */
export function PaymentsReadinessPanel({ readiness }: { readiness: PaymentsReadiness }) {
  if (readiness.ready && !readiness.pilotMode) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 space-y-3">
      <div className="flex items-start gap-2">
        <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">
            {readiness.ready
              ? "Payments are configured — finish the manual Stripe steps before turning PILOT_MODE off."
              : "Payments are NOT ready. Do not turn PILOT_MODE off until everything below is done."}
          </p>
          <p className="text-amber-900/80">
            Pilot mode is {readiness.pilotMode ? "ON (nobody is charged)" : "OFF (customers are charged)"}.
          </p>
        </div>
      </div>
      <ul className="space-y-1">
        {readiness.checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2">
            {c.ok ? (
              <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-amber-700 shrink-0" />
            )}
            <span className="font-mono text-xs">{c.label}</span>
          </li>
        ))}
      </ul>
      <div>
        <p className="font-semibold mb-1">Also check by hand in Stripe:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          {readiness.manual.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
