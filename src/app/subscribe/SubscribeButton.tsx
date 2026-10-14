"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Minus, Plus } from "lucide-react";
import {
  MAX_EMPLOYEES,
  MIN_EMPLOYEES,
  PLANS,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Plan picker + Subscribe. The customer chooses a plan and how many
 * employees file receipts; /api/checkout bills plan price × employees.
 */
export function SubscribeButton() {
  const [plan, setPlan] = useState<PlanId>("regular");
  const [employees, setEmployees] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PLANS.find((p) => p.id === plan) ?? PLANS[0];
  const clamp = (n: number) =>
    Math.min(MAX_EMPLOYEES, Math.max(MIN_EMPLOYEES, Math.round(n) || MIN_EMPLOYEES));

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, employees }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't start checkout. Try again.");
        setLoading(false);
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) {
        setError("Checkout URL missing from response.");
        setLoading(false);
        return;
      }
      window.location.href = url;
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold mb-2">Choose your plan</legend>
        {PLANS.map((p) => (
          <label
            key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
              plan === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
            )}
          >
            <input
              type="radio"
              name="plan"
              value={p.id}
              checked={plan === p.id}
              onChange={() => setPlan(p.id)}
              className="accent-[var(--primary)]"
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">
                {p.name}
                {p.popular ? (
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Most chosen
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                Up to {p.receipts} receipts per employee / month
              </span>
            </span>
            <span className="font-mono tabular-nums text-sm font-medium whitespace-nowrap">
              €{p.price}
              <span className="font-sans text-xs text-muted-foreground"> /employee</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="employees" className="text-sm font-semibold">
          Employees with expenses
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Fewer employees"
            onClick={() => setEmployees((n) => clamp(n - 1))}
            disabled={employees <= MIN_EMPLOYEES}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <input
            id="employees"
            type="number"
            inputMode="numeric"
            min={MIN_EMPLOYEES}
            max={MAX_EMPLOYEES}
            value={employees}
            onChange={(e) => setEmployees(clamp(Number(e.target.value)))}
            className="w-14 h-9 rounded-md border border-input bg-background text-center font-mono tabular-nums text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="More employees"
            onClick={() => setEmployees((n) => clamp(n + 1))}
            disabled={employees >= MAX_EMPLOYEES}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm flex items-baseline justify-between">
        <span className="text-muted-foreground">
          {employees} × €{selected.price}
        </span>
        <span>
          <span className="font-mono tabular-nums font-semibold" data-testid="subscribe-total">
            €{selected.price * employees}
          </span>
          <span className="text-xs text-muted-foreground"> /month excl. VAT</span>
        </span>
      </div>

      <div className="space-y-2">
        <Button className="w-full gap-2" onClick={handleClick} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? "Starting checkout..." : "Start your free week"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Free for 7 days, then billed monthly. Cancel anytime.
        </p>
        {error ? (
          <p className="text-xs text-destructive text-center">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
