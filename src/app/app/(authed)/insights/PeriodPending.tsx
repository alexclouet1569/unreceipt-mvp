"use client";

// Moving to another period keeps the numbers on screen at 45 % until the new
// ones arrive (DESIGN.md "Charts and Insights" → Loading), instead of a blank
// wait: the period links and the Dates form navigate inside a transition,
// and the body reads whether it is pending.

import { createContext, useContext, useTransition, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

const PeriodNav = createContext<{ pending: boolean; go: (href: string) => void } | null>(null);

export function PeriodScope({ children }: { children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const go = (href: string) => startTransition(() => router.push(href, { scroll: false }));
  return <PeriodNav.Provider value={{ pending, go }}>{children}</PeriodNav.Provider>;
}

/** A plain link (it opens in a new tab as usual) that keeps the page while the period loads. */
export function PeriodLink({
  href,
  children,
  ...rest
}: { href: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const nav = useContext(PeriodNav);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!nav || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    nav.go(href);
  };
  return (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

/** The Dates form: GET without JavaScript, a transition with it. */
export function PeriodForm({ action, className, children }: { action: string; className?: string; children: React.ReactNode }) {
  const nav = useContext(PeriodNav);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    if (!nav) return;
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string") params.set(k, v);
    nav.go(`${action}?${params.toString()}`);
  };
  return (
    <form action={action} method="get" onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}

export function PendingBody({ children }: { children: React.ReactNode }) {
  const pending = useContext(PeriodNav)?.pending ?? false;
  return (
    <div aria-busy={pending} className="transition-opacity duration-200" style={{ opacity: pending ? 0.45 : 1 }}>
      {children}
    </div>
  );
}
