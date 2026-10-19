"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getMerchantColor, getMerchantInitials } from "@/lib/merchant-display";
import { merchantLogoSlug } from "@/lib/merchant-logos";

type MerchantLogoProps = {
  merchant: string;
  /** Square size in px. */
  size: number;
  /** Corner radius in px. */
  radius: number;
  /**
   * False: always the initials badge. For names that aren't shops (a client
   * company), where a whole-word match on the logo list would be wrong.
   */
  logo?: boolean;
  className?: string;
};

/**
 * The merchant's store logo when it's on our hand-checked list, otherwise
 * the initials badge. The initials show until the logo has loaded, and
 * stay if it never does, so there's no empty tile. Decorative: the
 * merchant name is always printed next to it.
 */
export function MerchantLogo({ merchant, size, radius, logo = true, className }: MerchantLogoProps) {
  const slug = logo ? merchantLogoSlug(merchant) : null;
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const showLogo = slug != null && loadedSlug === slug;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden",
        showLogo ? "border border-[var(--hairline)] bg-card" : "text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: showLogo ? undefined : getMerchantColor(merchant),
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: Math.round(size * 0.34),
        letterSpacing: "-0.01em",
      }}
      aria-hidden="true"
      data-testid={showLogo ? "merchant-logo" : "merchant-initials"}
    >
      {showLogo ? null : getMerchantInitials(merchant)}
      {slug ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slug}
          src={`/api/merchant-logo/${slug}`}
          alt=""
          width={Math.round(size * 0.6)}
          height={Math.round(size * 0.6)}
          decoding="async"
          onLoad={() => setLoadedSlug(slug)}
          className={cn("object-contain", showLogo ? "" : "absolute opacity-0")}
          data-testid="merchant-logo-img"
        />
      ) : null}
    </div>
  );
}
