"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { checkSwedishVat } from "@/lib/compliance/se-vat-check";
import { SE_VAT_SOURCES } from "@/lib/compliance/se-vat-rules";
import { formatDate } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";

/**
 * "VAT check · Sweden" under a receipt: what the receipt shows against
 * Skatteverket's rules for a VAT deduction (src/lib/compliance). Renders
 * nothing when the check doesn't apply (no VAT charged, or a currency the
 * 4,000 kr limit can't be applied to). Notices use the honey attention
 * tokens: they ask for something, nothing is wrong with the app.
 */
export function VatCheckPanel({ receipt }: { receipt: Receipt }) {
  const result = checkSwedishVat(receipt);
  if (!result.applies) return null;

  const checkedOn = formatDate(SE_VAT_SOURCES.invoiceRules.checkedOn);

  return (
    <section
      aria-label="VAT check"
      className="space-y-2"
      data-testid="vat-check-panel"
    >
      <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--ink-muted)] uppercase">
        VAT check · Sweden
      </p>

      {result.findings.length === 0 ? (
        <p className="flex items-start gap-2 rounded-[10px] border border-[var(--hairline)] bg-card px-3.5 py-3 text-[13px] leading-snug">
          <CheckCircle2 className="mt-[1px] size-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
          <span>Nothing missing for a VAT deduction on what this receipt shows.</span>
        </p>
      ) : (
        <ul className="space-y-2">
          {result.findings.map((finding) => {
            const Icon = finding.level === "warning" ? AlertTriangle : Info;
            return (
              <li
                key={finding.id}
                className={`rounded-[10px] border border-[var(--hairline)] px-3.5 py-3 text-[13px] leading-snug ${
                  finding.level === "warning" ? "" : "bg-card"
                }`}
                style={
                  finding.level === "warning"
                    ? { background: "var(--attention-tint)" }
                    : undefined
                }
              >
                <p
                  id={`vat-finding-${finding.id}`}
                  className={`flex items-start gap-2 font-semibold ${
                    finding.level === "warning"
                      ? "text-[var(--attention-deep)]"
                      : "text-[var(--ink)]"
                  }`}
                >
                  <Icon className="mt-[1px] size-4 shrink-0" aria-hidden="true" />
                  {finding.title}
                </p>
                <p className="mt-1 pl-6 text-[var(--ink-muted)]">{finding.detail}</p>
                <p className="pl-6">
                  <a
                    href={finding.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-describedby={`vat-finding-${finding.id}`}
                    className="inline-flex min-h-11 items-center rounded-sm text-[12px] font-semibold text-[var(--ink-muted)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                  >
                    Skatteverket’s rule
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[12px] leading-snug text-[var(--ink-muted)]">
        Checks the receipt against Skatteverket’s rules as of {checkedOn}. Not
        tax advice: whether the purchase itself is deductible is for your
        accountant.
      </p>
    </section>
  );
}
