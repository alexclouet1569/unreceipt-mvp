// Shared Sentry options for the server, edge and browser runtimes.
//
// Sentry is OFF unless NEXT_PUBLIC_SENTRY_DSN is set (a DSN is designed to
// be public: it only allows sending events). Use an EU-region project
// (*.ingest.de.sentry.io) so error data stays in the EU like the rest of
// the stack.
//
// Receipts are financial and personal data, so events are scrubbed before
// they leave the process: no request bodies, cookies, headers, query
// strings or user identity beyond the opaque user id.

import type { ErrorEvent } from "@sentry/nextjs";

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

export const baseSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
};
