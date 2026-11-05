"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/firm/clients", label: "Clients" },
  { href: "/firm/settings", label: "Settings" },
];

export function FirmNav({ alsoCustomer }: { alsoCustomer: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="ml-auto flex items-center gap-1" aria-label="Firm">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex items-center px-3 rounded-[10px] transition-colors " +
              (active
                ? "bg-[var(--brand-tint)] text-[var(--ink)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)]")
            }
            style={{ height: "44px", fontSize: "14px", fontWeight: 600 }}
          >
            {l.label}
          </Link>
        );
      })}
      {alsoCustomer ? (
        <Link
          href="/app"
          className="inline-flex items-center px-3 rounded-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--brand-tint)] transition-colors"
          style={{ height: "44px", fontSize: "14px" }}
        >
          Your own receipts ↗
        </Link>
      ) : null}
    </nav>
  );
}
