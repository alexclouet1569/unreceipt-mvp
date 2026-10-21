"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { PLANS, overagePriceLabel, planPriceLabel, type PlanId } from "@/lib/plans";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Plan picker + Subscribe. Each plan is one flat monthly price for the
 * whole company; /api/checkout bills the chosen plan.
 */
export function SubscribeButton() {
  const { locale, t: messages } = useI18n();
  const t = messages.auth.subscribe;
  const [plan, setPlan] = useState<PlanId>("light");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PLANS.find((p) => p.id === plan) ?? PLANS[0];

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // The route's own errors are English; other languages get ours.
        setError((locale === "en" ? body.error : undefined) ?? t.checkoutFailed);
        setLoading(false);
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) {
        setError(t.checkoutUrlMissing);
        setLoading(false);
        return;
      }
      window.location.href = url;
    } catch {
      setError(t.networkError);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold mb-2">{t.choosePlan}</legend>
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
              <span className="block text-sm font-semibold">{p.name}</span>
              <span className="block text-xs text-muted-foreground">
                {t.upTo(p.receipts)}
              </span>
            </span>
            <span className="font-mono tabular-nums text-sm font-medium whitespace-nowrap">
              {planPriceLabel(p, locale)}
              <span className="font-sans text-xs text-muted-foreground">{t.perMonth}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground pt-1">
          {t.planNote(overagePriceLabel(locale))}
        </p>
      </fieldset>

      <div className="space-y-2">
        <Button className="w-full gap-2" onClick={handleClick} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? t.startingCheckout : t.startFreeWeek}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center" data-testid="subscribe-total">
          {t.freeThen(planPriceLabel(selected, locale))}
        </p>
        {error ? (
          <p className="text-xs text-destructive text-center">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
