import { cn } from "@/lib/utils";

type PerfEdgeProps = {
  variant?: "edge" | "divider";
  direction?: "top" | "bottom";
  className?: string;
};

/**
 * Receipt-perforation primitive.
 * - "edge": 8px-tall strip with an 8x8 dot mask (used at top/bottom of detail sheet).
 * - "divider": 1px dashed hairline (used between detail sections).
 */
export function PerfEdge({
  variant = "edge",
  direction = "top",
  className,
}: PerfEdgeProps) {
  if (variant === "divider") {
    return (
      <div
        data-testid="perfedge"
        data-variant="divider"
        className={cn("w-full", className)}
        style={{
          height: "1px",
          borderTop: "1px dashed var(--hairline)",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      data-testid="perfedge"
      data-variant="edge"
      data-direction={direction}
      className={cn("w-full pointer-events-none select-none", className)}
      style={{
        height: "8px",
        backgroundImage:
          "radial-gradient(circle 4px at 8px 4px, var(--surface) 4px, transparent 4.5px)",
        backgroundSize: "16px 8px",
        backgroundRepeat: "repeat-x",
        backgroundPosition: direction === "top" ? "0 0" : "0 100%",
      }}
      aria-hidden="true"
    />
  );
}
