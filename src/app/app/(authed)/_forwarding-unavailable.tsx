// Where the forwarding address goes when it couldn't be created on this load
// (loadHome() gives null rather than an address that doesn't route).
// Reloading retries the mint. Same frame as IntakeRow, no copy button:
// there is nothing to copy.

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
        className="bg-card text-[var(--ink-muted)]"
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: "12px",
          padding: "12px 14px",
          fontSize: "14px",
        }}
      >
        Your address isn&apos;t ready yet. Reload the page in a moment.
      </div>
    </div>
  );
}
