// Next.js server instrumentation: loads Sentry in the Node.js and Edge
// runtimes and reports errors from server components, route handlers and
// the proxy. A no-op unless NEXT_PUBLIC_SENTRY_DSN is set.

import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@/lib/sentry-options";

export function register() {
  if (!baseSentryOptions.enabled) return;
  Sentry.init(baseSentryOptions);
}

export const onRequestError = Sentry.captureRequestError;
