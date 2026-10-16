import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MerchantLogo } from "@/components/receipt/MerchantLogo";
import { MERCHANT_LOGOS } from "@/lib/merchant-logos";

// Every store on the logo list, as the app would show it: logo when the
// icon is good enough, initials otherwise. Preview deployments only, like
// /demo, so the founder can check the list by eye.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Store logos",
  robots: { index: false, follow: false },
};

function demoAllowed(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "preview";
  return process.env.NODE_ENV === "development";
}

// A display name per slug: the first match pattern, title-cased.
const displayName = (pattern: string) =>
  pattern.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export default function LogosPage() {
  if (!demoAllowed()) notFound();
  const entries = Object.entries(MERCHANT_LOGOS);
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[var(--surface)] px-4 py-6 text-[var(--ink)]">
      <h1 className="text-[24px] font-bold tracking-[-0.02em]">Store logos</h1>
      <p className="mt-1 text-[13px] font-medium text-[var(--ink-muted)]">
        {entries.length} stores. Initials mean the store&apos;s icon is missing or too small
        to look sharp.
      </p>
      <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {entries.map(([slug, entry]) => {
          const name = displayName(entry.match[0]);
          return (
            <li
              key={slug}
              className="flex items-center gap-3 rounded-[12px] border border-[var(--hairline)] bg-card px-3 py-2.5"
            >
              <MerchantLogo merchant={entry.match[0]} size={40} radius={10} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold">{name}</p>
                <p className="truncate text-[12px] font-medium text-[var(--ink-muted)]">
                  {entry.domain}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
