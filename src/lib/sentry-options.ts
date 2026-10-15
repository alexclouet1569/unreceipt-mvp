// Shared Sentry options for the server, edge and browser runtimes.
//
// Sentry is OFF unless NEXT_PUBLIC_SENTRY_DSN is set (a DSN is designed to
// be public: it only allows sending events). Use an EU-region project
// (*.ingest.de.sentry.io) so error data stays in the EU like the rest of
// the stack.
//
// Receipts are financial and personal data, so events are scrubbed before
// they leave the process: no request bodies, cookies, headers, query
// strings (Stripe session ids, auth codes) or user identity beyond the
// opaque user id. Console breadcrumbs are dropped — they repeat whatever
// was logged, including error objects. Performance tracing is off: its
// spans carry full URLs and we don't need it yet.

import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  return event;
}

const URL_KEYS = ["url", "to", "from"] as const;

function stripQuery(value: unknown): unknown {
  return typeof value === "string" ? value.split("?")[0] : value;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data) {
    const data = { ...breadcrumb.data };
    for (const key of URL_KEYS) {
      if (key in data) data[key] = stripQuery(data[key]);
    }
    breadcrumb.data = data;
  }
  return breadcrumb;
}

export const baseSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
