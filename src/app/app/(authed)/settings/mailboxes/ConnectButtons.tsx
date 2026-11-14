// "Connect Gmail" / "Connect Outlook": links to our explainer page, which
// links on to the provider. One button per configured provider, outlined
// (a pair of equal choices: DESIGN.md keeps the green for the explainer's
// Continue). No "use client": rendered by Settings, the first-run step and
// the empty state alike.

import Link from "next/link";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVIDER_NAME, configuredList, explainerHref, type MailboxProviders } from "./copy";

// White, hairline, ink: DESIGN.md's outline button, 48px tall.
export const OUTLINE_LINK =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border border-[var(--hairline)] bg-card px-4 type-body font-semibold text-[var(--ink)] outline-none transition-colors duration-100 hover:bg-[var(--surface)] focus-visible:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50";

// The screen's one green action (--brand-action, its label --on-brand-action).
export const PRIMARY_LINK =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 type-body font-semibold text-primary-foreground outline-none transition-colors duration-100 hover:bg-[var(--brand-action-deep)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function ConnectButtons({
  providers,
  stacked = false,
  className,
}: {
  providers: MailboxProviders;
  // One under the other at every width (narrow columns: first run, empty state).
  stacked?: boolean;
  className?: string;
}) {
  const list = configuredList(providers);
  if (list.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", !stacked && "sm:flex-row", className)}>
      {list.map((provider) => (
        <Link key={provider} href={explainerHref(provider)} className={cn(OUTLINE_LINK, "w-full", !stacked && "sm:flex-1")}>
          <Mail aria-hidden="true" className="h-4 w-4" />
          Connect {PROVIDER_NAME[provider]}
        </Link>
      ))}
    </div>
  );
}
