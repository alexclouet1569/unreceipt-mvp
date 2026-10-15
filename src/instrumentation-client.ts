// Browser-side Sentry. No session replay (it would record receipt contents).
// A no-op unless NEXT_PUBLIC_SENTRY_DSN is set.

import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@/lib/sentry-options";

if (baseSentryOptions.enabled) {
  Sentry.init(baseSentryOptions);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
