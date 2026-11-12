// Where the forwarding address goes when it couldn't be created on this load
// (loadHome() gives null rather than an address that doesn't route).
// Reloading retries the mint. Same frame and callout as IntakeRow (whose
// inline callout size it mirrors), no copy button: there is nothing to copy.
// Used on the dashboard, the first-run step and both Settings pages.

export function ForwardingUnavailable() {
  return (
    <div className="text-left" role="status">
      <p
        className="font-accent italic text-[var(--ink-muted)]"
        style={{ fontSize: "12px", marginBottom: "6px" }}
      >
        Forward email receipts to
      </p>
      <div
        className="type-body bg-card text-[var(--ink-muted)]"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: "12px",
          padding: "12px 14px",
        }}
      >
        Your address isn&apos;t ready yet. Reload the page in a moment.
      </div>
    </div>
  );
}
