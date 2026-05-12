"use client";

import { Plus } from "lucide-react";

type CaptureFabProps = {
  onClick: () => void;
};

/**
 * Bottom-center FAB per DESIGN.md spec — 64×64, brand green, safe-area
 * aware, the only place in the system with a real shadow. Press
 * animation: scale(0.92) then a gentle overshoot spring back to 1.0.
 */
export function CaptureFab({ onClick }: CaptureFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Capture receipt"
      data-testid="capture-fab"
      className="fixed left-1/2 z-50 -translate-x-1/2 active:scale-[0.92] transition-transform duration-[240ms]"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        width: "64px",
        height: "64px",
        borderRadius: "9999px",
        background: "var(--primary)",
        boxShadow:
          "0 8px 24px -8px rgba(31, 157, 99, 0.45), 0 2px 6px -2px rgba(23, 26, 46, 0.08)",
        transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <Plus
        className="mx-auto"
        style={{
          width: "28px",
          height: "28px",
          strokeWidth: 2.5,
          color: "#FFFFFF",
        }}
        aria-hidden="true"
      />
    </button>
  );
}
