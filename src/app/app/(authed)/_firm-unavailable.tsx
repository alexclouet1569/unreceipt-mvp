import Link from "next/link";

/**
 * Shown on /app when the firm portal sent a firm-only user back with
 * `?firm=unavailable`: their seat couldn't be read or claimed (a database
 * error). Redirecting to /firm again would loop, so we stop here and let
 * them retry by hand.
 */
export function FirmUnavailable() {
  return (
    <div className="flex justify-center px-4 py-16">
      <div className="text-center max-w-sm">
        <h1 className="type-display-lg font-display text-[var(--ink)] mb-2">The firm portal didn&apos;t open</h1>
        <p className="type-body text-[var(--ink-muted)] mb-5">
          We couldn&apos;t load your firm just now. Try again in a moment.
        </p>
        <Link
          href="/firm"
          className="inline-flex items-center justify-center h-11 px-5 rounded-[10px] bg-primary text-primary-foreground text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-[var(--ring)] focus-visible:outline-offset-2"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
