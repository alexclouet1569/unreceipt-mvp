"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";
import { checkSwedishVat } from "@/lib/compliance/se-vat-check";
import type { CompanyCountry } from "@/lib/company-country";
import { SE_VAT_SOURCES } from "@/lib/compliance/se-vat-rules";
import { formatDate } from "@/lib/receipt-format";
import type { Receipt } from "@/lib/types";

/**
 * "VAT check · Sweden" under a receipt: what the receipt shows against
 * Skatteverket's rules for a VAT deduction (src/lib/compliance). Only for
 * companies in Sweden; with no country set it asks for one in Settings.
 * Renders nothing when the check doesn't apply (other country, no VAT
 * charged, another currency). Notices use the honey attention tokens: they
 * ask for something, nothing is wrong with the app.
 */
export function VatCheckPanel({
  receipt,
  companyCountry,
}: {
  receipt: Receipt;
  companyCountry: CompanyCountry | null;
}) {
  if (companyCountry == null) {
    return (
      <p
        className="rounded-[10px] border border-[var(--hairline)] bg-card px-3.5 py-3 text-[13px] leading-snug text-[var(--ink-muted)]"
        data-testid="vat-check-country-prompt"
      >
        Is your company in Sweden?{" "}
        <Link
          href="/app/settings#company-country"
          className="inline-flex min-h-11 items-center rounded-sm font-semibold text-[var(--ink)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          Set its country
        </Link>{" "}
        to check receipts against Swedish VAT rules.
      </p>
    );
  }

  const result = checkSwedishVat(receipt, companyCountry);
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

      {result.allClear ? (
        <p className="flex items-start gap-2 rounded-[10px] border border-[var(--hairline)] bg-card px-3.5 py-3 text-[13px] leading-snug">
          <CheckCircle2 className="mt-[1px] size-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />
          <span>
            We found {result.allClear.found} on this receipt. Not checked:{" "}
            {result.allClear.notChecked}.
            {result.allClear.unconfirmed
              ? " Based on a reading you haven’t confirmed yet."
              : ""}
          </span>
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
