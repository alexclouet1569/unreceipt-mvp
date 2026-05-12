import { cn } from "@/lib/utils";

type WordmarkVariant = "horizontal" | "stacked" | "wordmark" | "icon";
type WordmarkSurface = "light" | "dark" | "mint";

type WordmarkProps = {
  variant?: WordmarkVariant;
  /**
   * The surface the wordmark sits on. Switches the brand-book color set:
   *   light — cream / white page (default)
   *   dark  — Deep Space navy page
   *   mint  — Green Mint page (rare; tinted hero blocks)
   */
  on?: WordmarkSurface;
  /** Accessible label. Defaults to "UnReceipt". */
  title?: string;
  className?: string;
  /** Inline style — typically `fontSize` to control overall mark size. */
  style?: React.CSSProperties;
};

const BRAND = "#27BE7B";
const INK = "#303568";
const SURFACE = "#FAFAF7";

// Brand-book color rules (pp. 9–11):
//   light  → green receipt body, cream lines, navy arrow, navy "Un" + green "Receipt"
//   dark   → cream receipt body, green lines, green arrow, cream wordmark (single color)
//   mint   → cream receipt body, green lines, navy arrow, navy wordmark (single color)
const COLOR_SETS: Record<
  WordmarkSurface,
  {
    receiptFill: string;
    receiptLine: string;
    arrow: string;
    un: string;
    receipt: string;
  }
> = {
  light: {
    receiptFill: BRAND,
    receiptLine: SURFACE,
    arrow: INK,
    un: INK,
    receipt: BRAND,
  },
  dark: {
    receiptFill: SURFACE,
    receiptLine: BRAND,
    arrow: BRAND,
    un: SURFACE,
    receipt: SURFACE,
  },
  mint: {
    receiptFill: SURFACE,
    receiptLine: BRAND,
    arrow: INK,
    un: INK,
    receipt: INK,
  },
};

function ReceiptIsotype({
  fill,
  line,
  arrow,
  className,
}: {
  fill: string;
  line: string;
  arrow: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Receipt body — rounded top corners, serrated bottom edge */}
      <path
        d="M30 14 H56 A2 2 0 0 1 58 16 V49 L55.5 52 L52.5 49 L49.5 52 L46.5 49 L43.5 52 L40.5 49 L37.5 52 L34.5 49 L31.5 52 L30 49 Z"
        fill={fill}
      />
      {/* Text lines inside the receipt */}
      <g fill={line}>
        <rect x="36" y="22" width="14" height="2.6" rx="1.3" />
        <rect x="33" y="29" width="20" height="2.6" rx="1.3" />
        <rect x="33" y="36" width="17" height="2.6" rx="1.3" />
        <rect x="33" y="43" width="14" height="2.6" rx="1.3" />
      </g>
      {/* Circular arrow wrapping the top-left of the receipt.
          Arc sweeps counter-clockwise from inside the receipt's top-left
          around to a right-pointing arrowhead at the top. */}
      <path
        d="M30 26 A12 12 0 1 1 23 11"
        stroke={arrow}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M19.5 11 L25.5 7.5 L25.5 14.5 Z"
        fill={arrow}
      />
    </svg>
  );
}

function WordmarkText({
  un,
  receipt,
  className,
}: {
  un: string;
  receipt: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-baseline whitespace-nowrap",
        className,
      )}
      style={{
        // Brand book sets the wordmark in Manrope ExtraBold (800).
        fontWeight: 800,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      <span style={{ color: un }}>Un</span>
      <span style={{ color: receipt }}>Receipt</span>
    </span>
  );
}

/**
 * Brand wordmark per the UnReceipt brand book (pp. 9–11).
 *
 * Variants:
 *   horizontal — icon + wordmark on a single line (primary)
 *   stacked    — icon centered above wordmark (narrow placements)
 *   wordmark   — wordmark only (when the icon is already established)
 *   icon       — icon only (PWA, favicon, social profile)
 *
 * Size with a parent `font-size` (or the `text-*` Tailwind utility on
 * `className`). The icon scales relative to the wordmark cap-height.
 */
export function Wordmark({
  variant = "horizontal",
  on = "light",
  title = "UnReceipt",
  className,
  style,
}: WordmarkProps) {
  const colors = COLOR_SETS[on];

  if (variant === "icon") {
    return (
      <span
        role="img"
        aria-label={title}
        data-testid="wordmark"
        data-variant="icon"
        className={cn("inline-block", className)}
        style={{
          width: "1em",
          height: "1em",
          ...style,
        }}
      >
        <ReceiptIsotype
          fill={colors.receiptFill}
          line={colors.receiptLine}
          arrow={colors.arrow}
          className="w-full h-full"
        />
      </span>
    );
  }

  if (variant === "wordmark") {
    return (
      <span
        role="img"
        aria-label={title}
        data-testid="wordmark"
        data-variant="wordmark"
        className={cn(className)}
        style={style}
      >
        <WordmarkText un={colors.un} receipt={colors.receipt} />
      </span>
    );
  }

  if (variant === "stacked") {
    return (
      <span
        role="img"
        aria-label={title}
        data-testid="wordmark"
        data-variant="stacked"
        className={cn("inline-flex flex-col items-center", className)}
        style={{ gap: "0.4em", ...style }}
      >
        <ReceiptIsotype
          fill={colors.receiptFill}
          line={colors.receiptLine}
          arrow={colors.arrow}
          className="w-[2.6em] h-[2.6em]"
        />
        <WordmarkText un={colors.un} receipt={colors.receipt} />
      </span>
    );
  }

  // horizontal (default)
  return (
    <span
      role="img"
      aria-label={title}
      data-testid="wordmark"
      data-variant="horizontal"
      className={cn("inline-flex items-center", className)}
      style={{ gap: "0.18em", ...style }}
    >
      <ReceiptIsotype
        fill={colors.receiptFill}
        line={colors.receiptLine}
        arrow={colors.arrow}
        className="w-[1.25em] h-[1.25em] shrink-0"
      />
      <WordmarkText un={colors.un} receipt={colors.receipt} />
    </span>
  );
}
