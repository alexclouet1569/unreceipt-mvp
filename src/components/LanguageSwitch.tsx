"use client";

// The product language for this device (Settings → Language). Saved in a
// cookie, so the server renders the next page in it too.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_NAME } from "@/lib/locale";
import { saveLocale, useI18n } from "@/lib/i18n/client";

export function LanguageSwitch() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t.common.language}
      className="grid grid-cols-3 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-1"
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            disabled={pending}
            onClick={() => {
              if (active) return;
              saveLocale(l);
              startTransition(() => router.refresh());
            }}
            className={
              active
                ? "h-11 rounded-[6px] border border-[var(--hairline)] bg-card text-[14px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                : "h-11 rounded-[6px] border border-transparent text-[14px] font-semibold text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            }
          >
            {LOCALE_NAME[l].label}
          </button>
        );
      })}
    </div>
  );
}
