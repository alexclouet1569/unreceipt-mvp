// Operational toggle: free pilot mode.
//
// When PILOT_MODE="true", the Stripe subscription gate at /app is
// bypassed and a "free pilot" banner is shown. Used while the founder
// completes business registration / Stripe Live verification. Flip
// back to paid by unsetting the env var (or setting it to "false") and
// redeploying.
//
// Strict string compare — anything except literal "true" is paid mode,
// so a typo or empty value defaults safely to charging customers.

export function isPilotMode(): boolean {
  return process.env.PILOT_MODE === "true";
}
