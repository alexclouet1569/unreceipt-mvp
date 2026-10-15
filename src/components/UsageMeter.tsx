import { OVERAGE_PRICE, formatPrice, type Plan } from "@/lib/plans";

type Props = {
  used: number;
  plan: Plan | null;
  extra: number;
  overageBilled: boolean;
  periodEnd: string;
  suggestion: string | null;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

/** Receipts used this billing period against the plan's allowance. */
export function UsageMeter({ used, plan, extra, overageBilled, periodEnd, suggestion }: Props) {
  const resets = dateFormat.format(new Date(periodEnd));

  if (!plan) {
    return (
      <div
        className="bg-card"
        style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
      >
        <p className="text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
          {used} receipt{used === 1 ? "" : "s"} this month
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", marginTop: "2px" }}>
          No plan limit during the free pilot. Counter resets {resets}.
        </p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((used / plan.receipts) * 100));
  const over = extra > 0;

  return (
    <div
      className="bg-card"
      style={{ border: "1px solid var(--hairline)", borderRadius: "12px", padding: "12px 14px" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[var(--ink)]" style={{ fontSize: "15px", fontWeight: 600 }}>
          {used} of {plan.receipts} receipts
        </p>
        <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", fontWeight: 500 }}>
          {plan.name} plan
        </p>
      </div>
      <div
        className="mt-2 overflow-hidden"
        style={{ height: "6px", borderRadius: "9999px", background: "var(--brand-tint)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={plan.receipts}
        aria-valuenow={Math.min(used, plan.receipts)}
        aria-label="Receipts used this period"
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over ? "var(--attention)" : "var(--primary)",
          }}
        />
      </div>
      <p className="text-[var(--ink-muted)]" style={{ fontSize: "13px", marginTop: "8px" }}>
        {over
          ? overageBilled
            ? <>
                {extra} extra × {formatPrice(OVERAGE_PRICE)} ={" "}
                <span className="font-mono tabular-nums">{formatPrice(extra * OVERAGE_PRICE)}</span>{" "}
                on your next invoice.
              </>
            : `${extra} over your plan — everything is still saved.`
          : `Resets ${resets}. Extra receipts are ${formatPrice(OVERAGE_PRICE)} each.`}
      </p>
      {suggestion ? (
        <p className="text-[var(--ink)]" style={{ fontSize: "13px", marginTop: "6px", fontWeight: 500 }}>
          {suggestion} Write to us to switch.
        </p>
      ) : null}
    </div>
  );
}
