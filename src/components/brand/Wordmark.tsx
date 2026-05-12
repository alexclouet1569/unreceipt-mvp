import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
};

export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      data-testid="wordmark"
      className={cn(
        "font-display font-bold inline-flex items-baseline text-[15px]",
        className,
      )}
      style={{ letterSpacing: "-0.02em", gap: "1px" }}
    >
      <span
        data-testid="wordmark-un"
        className="font-mono font-medium"
        style={{
          fontSize: "0.78em",
          padding: "1px 3px 1px 4px",
          borderRadius: "5px",
          background: "var(--ink)",
          color: "var(--surface)",
          marginRight: "3px",
          transform: "translateY(-1px)",
          letterSpacing: "0",
        }}
      >
        Un
      </span>
      Receipt
    </span>
  );
}
