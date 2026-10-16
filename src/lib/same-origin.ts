// True when a request's Origin header names the host it was sent to.
// Browsers always send Origin on cross-site POSTs, so routes that act on
// the session refuse a mismatch.
export function isSameHost(origin: string, host: string | null): boolean {
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}
